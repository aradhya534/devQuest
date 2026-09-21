import type { Knex } from "knex";
import type { PostingInput } from "../domain/ledger.js";
import { NotImplementedError } from "../domain/notImplemented.js";

interface PostingRow {
  seq: number;
  id: string;
  entry_id: string;
  account_id: string;
  asset: string;
  amount: string;
  created_at: string;
}

export async function insertBalancedEntry(_executor: Knex, _postings: readonly PostingInput[], _reversalOfEntryId?: string): Promise<string> {
  throw new NotImplementedError("insertBalancedEntry");
}

export async function postEntry(_db: Knex, _postings: readonly PostingInput[], _reversalOfEntryId?: string): Promise<string> {
  throw new NotImplementedError("postEntry");
}

export async function reverseEntry(_db: Knex, _entryId: string): Promise<string> {
  throw new NotImplementedError("reverseEntry");
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

export async function trialBalance(_db: Knex): Promise<Map<string, bigint>> {
  throw new NotImplementedError("trialBalance");
}

export interface StatementPage {
  postings: PostingRow[];
  nextCursor: string | null;
}

export async function statementPage(_db: Knex, _accountId: string, _limit: number, _cursor?: string): Promise<StatementPage> {
  throw new NotImplementedError("statementPage");
}
