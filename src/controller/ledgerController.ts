import type { Request, Response } from "express";
import { v4 as uuidv4 } from "uuid";
import db from "../../db/db-config.js";
import HttpStatus from "../enums/httpStatus.js";
import { AccountType, UnbalancedEntryError, type PostingInput } from "../domain/ledger.js";
import { postEntry, reverseEntry, deriveBalance, statementPage, trialBalance } from "../repositories/ledgerRepository.js";
import { closeAccount, AccountHasBalanceError } from "../repositories/accountsRepository.js";
import { NotImplementedError } from "../domain/notImplemented.js";

interface CreateAccountBody {
  type?: string;
  name?: string;
}

const ACCOUNT_TYPES: ReadonlySet<string> = new Set(Object.values(AccountType));

const createAccount = async (req: Request<unknown, unknown, CreateAccountBody>, res: Response): Promise<void> => {
  const { type, name } = req.body;

  if (typeof type !== "string" || typeof name !== "string" || !ACCOUNT_TYPES.has(type) || name.trim() === "") {
    res.status(HttpStatus.BAD_REQUEST).json({ error: { code: "INVALID_ACCOUNT", details: [{ message: "type and name are required; type must be a known account type" }] } });
    return;
  }

  const id = uuidv4();
  await db("accounts").insert({ id, type, name });
  res.status(HttpStatus.CREATED).json({ data: { id, type, name }, meta: {} });
};

interface RawPostingInput {
  accountId?: unknown;
  asset?: unknown;
  amount?: unknown;
}

interface CreateEntryBody {
  postings?: RawPostingInput[];
}

function parsePostings(raw: RawPostingInput[] | undefined): PostingInput[] | null {
  if (!Array.isArray(raw) || raw.length < 2) return null;

  const postings: PostingInput[] = [];
  for (const item of raw) {
    if (typeof item.accountId !== "string" || typeof item.asset !== "string" || typeof item.amount !== "string" || !/^-?[0-9]+$/.test(item.amount)) {
      return null;
    }
    postings.push({ accountId: item.accountId, asset: item.asset, amount: BigInt(item.amount) });
  }
  return postings;
}

const createEntry = async (req: Request<unknown, unknown, CreateEntryBody>, res: Response): Promise<void> => {
  const postings = parsePostings(req.body.postings);
  if (!postings) {
    res.status(HttpStatus.BAD_REQUEST).json({ error: { code: "INVALID_POSTINGS", details: [{ message: "postings must be an array of at least two { accountId, asset, amount } entries" }] } });
    return;
  }

  try {
    const entryId = await postEntry(db, postings);
    res.status(HttpStatus.CREATED).json({ data: { id: entryId }, meta: {} });
  } catch (error: unknown) {
    if (error instanceof UnbalancedEntryError) {
      res.status(422).json({ error: { code: "ENTRY_NOT_BALANCED", details: [{ message: error.message }] } });
      return;
    }
    throw error;
  }
};

const reverse = async (req: Request<{ entryId: string }>, res: Response): Promise<void> => {
  const reversalId = await reverseEntry(db, req.params.entryId);
  res.status(HttpStatus.CREATED).json({ data: { id: reversalId }, meta: {} });
};

const getBalance = async (req: Request<{ accountId: string }>, res: Response): Promise<void> => {
  const { asset, asOf, asOfEntry } = req.query;
  if (typeof asset !== "string") {
    res.status(HttpStatus.BAD_REQUEST).json({ error: { code: "MISSING_ASSET", details: [{ message: "asset query parameter is required" }] } });
    return;
  }

  const balance = await deriveBalance(db, req.params.accountId, asset, {
    asOfTimestamp: typeof asOf === "string" ? asOf : undefined,
    asOfEntryId: typeof asOfEntry === "string" ? asOfEntry : undefined,
  });

  res.status(HttpStatus.OK).json({ data: { accountId: req.params.accountId, asset, amount: balance.toString() }, meta: {} });
};

const getStatement = async (req: Request<{ accountId: string }>, res: Response): Promise<void> => {
  const { cursor } = req.query;
  const limitRaw = req.query["limit"];
  const limit = typeof limitRaw === "string" && /^[0-9]+$/.test(limitRaw) ? Math.min(Number(limitRaw), 200) : 50;

  const page = await statementPage(db, req.params.accountId, limit, typeof cursor === "string" ? cursor : undefined);
  res.status(HttpStatus.OK).json({
    data: page.postings.map((posting) => ({ id: posting.id, entryId: posting.entry_id, asset: posting.asset, amount: posting.amount, createdAt: posting.created_at })),
    meta: { nextCursor: page.nextCursor, hasMore: page.nextCursor !== null },
  });
};

const getTrialBalance = async (_req: Request, res: Response): Promise<void> => {
  const sums = await trialBalance(db);
  const byAsset: Record<string, string> = {};
  for (const [asset, sum] of sums) byAsset[asset] = sum.toString();
  const balanced = [...sums.values()].every((sum) => sum === 0n);
  res.status(HttpStatus.OK).json({ data: { byAsset, balanced }, meta: {} });
};

const close = async (req: Request<{ accountId: string }>, res: Response): Promise<void> => {
  try {
    await closeAccount(db, req.params.accountId);
    res.status(HttpStatus.OK).json({ data: { id: req.params.accountId, status: "closed" }, meta: {} });
  } catch (error: unknown) {
    if (error instanceof AccountHasBalanceError) {
      res.status(HttpStatus.CONFLICT).json({ error: { code: "ACCOUNT_HAS_BALANCE", details: [{ message: error.message }] } });
      return;
    }
    throw error;
  }
};

const listAccounts = async (_req: Request, _res: Response): Promise<void> => {
  throw new NotImplementedError("listAccounts");
};

export default { createAccount, createEntry, reverse, getBalance, getStatement, getTrialBalance, close, listAccounts };
