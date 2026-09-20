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

export async function deriveBalance(_db: Knex, _accountId: string, _asset: string, _options: BalanceOptions = {}): Promise<bigint> {
  throw new NotImplementedError("deriveBalance");
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
