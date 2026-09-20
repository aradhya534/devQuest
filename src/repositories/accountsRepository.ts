import type { Knex } from "knex";
import { NotImplementedError } from "../domain/notImplemented.js";

export type AccountStatus = "active" | "closed";

interface AccountRow {
  id: string;
  status: AccountStatus;
}

export async function getStatus(db: Knex, accountId: string): Promise<AccountStatus | null> {
  const row = await db<AccountRow>("accounts").where({ id: accountId }).first("status");
  return row ? row.status : null;
}

export class AccountClosedError extends Error {
  constructor(public readonly accountId: string) {
    super(`Account ${accountId} is closed`);
  }
}

export class AccountHasBalanceError extends Error {
  constructor(public readonly accountId: string) {
    super(`Account ${accountId} still has a nonzero balance in at least one asset`);
  }
}

export async function assertOpen(db: Knex, accountId: string): Promise<void> {
  const status = await getStatus(db, accountId);
  if (status === "closed" || status === null) {
    throw new AccountClosedError(accountId);
  }
}

export async function closeAccount(_db: Knex, _accountId: string): Promise<void> {
  throw new NotImplementedError("closeAccount");
}
