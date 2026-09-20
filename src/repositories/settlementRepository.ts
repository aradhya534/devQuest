import crypto from "node:crypto";
import type { Knex } from "knex";
import type { AccountBalance } from "../domain/settlement.js";
import { NotImplementedError } from "../domain/notImplemented.js";

interface BalanceRow {
  account_id: string;
  asset: string;
  available: string;
  held: string;
}

// Given as working infrastructure — use these from within the functions
// below rather than querying account_balances directly.
export async function readBalance(trx: Knex.Transaction, accountId: string, asset: string): Promise<AccountBalance> {
  const row = await trx<BalanceRow>("account_balances").where({ account_id: accountId, asset }).first();
  return row ? { available: BigInt(Number(row.available)), held: BigInt(Number(row.held)) } : { available: 0n, held: 0n };
}

export async function writeBalance(trx: Knex.Transaction, accountId: string, asset: string, balance: AccountBalance): Promise<void> {
  const existing = await trx<BalanceRow>("account_balances").where({ account_id: accountId, asset }).first();
  const values = { available: balance.available.toString(), held: balance.held.toString() };
  if (existing) {
    await trx<BalanceRow>("account_balances").where({ account_id: accountId, asset }).update({ available: values.available });
  } else {
    await trx<BalanceRow>("account_balances").insert({ account_id: accountId, asset, ...values });
  }
}

export async function getBalance(db: Knex, accountId: string, asset: string): Promise<AccountBalance> {
  return readBalance(db as Knex.Transaction, accountId, asset);
}

export async function hold(_db: Knex, _accountId: string, _asset: string, _amount: bigint): Promise<AccountBalance> {
  throw new NotImplementedError("hold");
}

export async function release(_db: Knex, _accountId: string, _asset: string, _amount: bigint): Promise<AccountBalance> {
  throw new NotImplementedError("release");
}

export async function deposit(_db: Knex, _accountId: string, _asset: string, _amount: bigint): Promise<AccountBalance> {
  throw new NotImplementedError("deposit");
}

export async function withdraw(_db: Knex, _accountId: string, _asset: string, _amount: bigint): Promise<AccountBalance> {
  throw new NotImplementedError("withdraw");
}

export interface TradeSettlement {
  sellerAssetAccountId: string;
  buyerAssetAccountId: string;
  asset: string;
  quantity: bigint;
  buyerCashAccountId: string;
  sellerCashAccountId: string;
  cashAsset: string;
  cashAmount: bigint;
}

export async function settleTrade(_db: Knex, _trade: TradeSettlement): Promise<string> {
  throw new NotImplementedError("settleTrade");
}

function requestHash(body: unknown): string {
  return crypto.createHash("sha256").update(JSON.stringify(body)).digest("hex");
}

export class IdempotencyConflictError extends Error {
  constructor() {
    super("Idempotency-Key was reused with a different request body");
  }
}

function isUniqueConstraintViolation(error: unknown): boolean {
  return error instanceof Error && /UNIQUE constraint failed/i.test(error.message);
}

type Json = string | number | boolean | null | Json[] | { [key: string]: Json };

// Checks for an existing key before running the operation, so the common
// case of a first-time request never touches the idempotent_requests table.
export async function withIdempotency<T extends Json>(db: Knex, key: string, body: unknown, operation: (trx: Knex.Transaction) => Promise<T>): Promise<T> {
  const hash = requestHash(body);

  try {
    return await db.transaction(async (trx) => {
      const result = await operation(trx);
      await trx("idempotent_requests").insert({ key, request_hash: hash, response_json: JSON.stringify(result) });
      return result;
    });
  } catch (error: unknown) {
    if (!isUniqueConstraintViolation(error)) throw error;

    const existing = await db<{ key: string; request_hash: string; response_json: string }>("idempotent_requests").where({ key }).first();
    if (!existing) throw error;
    return JSON.parse(existing.response_json) as T;
  }
}
