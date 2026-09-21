import type { Knex } from "knex";
import { v4 as uuidv4 } from "uuid";
import { assertBalanced, reversePostings, type PostingInput } from "../domain/ledger.js";

interface PostingRow {
  seq: number;
  id: string;
  entry_id: string;
  account_id: string;
  asset: string;
  amount: string;
  created_at: string;
}

export async function insertBalancedEntry(executor: Knex, postings: readonly PostingInput[], reversalOfEntryId?: string): Promise<string> {
  assertBalanced(postings);
  const entryId = uuidv4();
  await executor("ledger_entries").insert({
    id: entryId,
    reversal_of_entry_id: reversalOfEntryId ?? null,
  });

  const postingRows = postings.map((p) => ({
    id: uuidv4(),
    entry_id: entryId,
    account_id: p.accountId,
    asset: p.asset,
    amount: p.amount.toString(),
  }));

  await executor("postings").insert(postingRows);
  return entryId;
}

export async function postEntry(db: Knex, postings: readonly PostingInput[], reversalOfEntryId?: string): Promise<string> {
  assertBalanced(postings);
  return db.transaction(async (trx) => {
    return insertBalancedEntry(trx, postings, reversalOfEntryId);
  });
}

export async function reverseEntry(db: Knex, entryId: string): Promise<string> {
  const rows = await db("postings").where({ entry_id: entryId });
  if (rows.length === 0) {
    throw new Error(`Entry not found: ${entryId}`);
  }
  const originalPostings: PostingInput[] = rows.map((r) => ({
    accountId: r.account_id,
    asset: r.asset,
    amount: BigInt(r.amount),
  }));
  const reversed = reversePostings(originalPostings);
  return postEntry(db, reversed, entryId);
}

export interface BalanceOptions {
  asOfTimestamp?: string;
  asOfEntryId?: string;
}

export async function deriveBalance(db: Knex, accountId: string, asset: string, options: BalanceOptions = {}): Promise<bigint> {
  let query = db("postings").where({ account_id: accountId, asset });
  if (options.asOfTimestamp) {
    query = query.where("created_at", "<=", options.asOfTimestamp);
  }
  if (options.asOfEntryId) {
    const entry = await db("ledger_entries").where({ id: options.asOfEntryId }).first();
    if (entry) {
      query = query.where("seq", "<=", entry.seq);
    }
  }
  const rows = await query.select("amount");
  return rows.reduce((sum, row) => sum + BigInt(row.amount), 0n);
}

export async function trialBalance(db: Knex): Promise<Map<string, bigint>> {
  const rows = await db("postings").select("asset", "amount");
  const result = new Map<string, bigint>();
  for (const r of rows) {
    const cur = result.get(r.asset) ?? 0n;
    result.set(r.asset, cur + BigInt(r.amount));
  }
  return result;
}

export interface StatementPage {
  postings: PostingRow[];
  nextCursor: string | null;
}

export async function statementPage(db: Knex, accountId: string, limit: number, cursor?: string): Promise<StatementPage> {
  let query = db("postings").where({ account_id: accountId });
  if (cursor) {
    const cursorRow = await db("postings").where({ id: cursor }).first();
    if (cursorRow) {
      query = query.where("seq", ">", cursorRow.seq);
    }
  }
  const rows: PostingRow[] = await query.orderBy("seq", "asc").limit(limit + 1);
  const hasMore = rows.length > limit;
  const pageRows = hasMore ? rows.slice(0, limit) : rows;
  const nextCursor = hasMore && pageRows.length > 0 ? pageRows[pageRows.length - 1]!.id : null;

  return {
    postings: pageRows,
    nextCursor,
  };
}
