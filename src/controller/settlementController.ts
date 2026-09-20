import type { Request, Response } from "express";
import db from "../../db/db-config.js";
import HttpStatus from "../enums/httpStatus.js";
import { InsufficientAvailableError, InsufficientHeldError } from "../domain/settlement.js";
import * as settlement from "../repositories/settlementRepository.js";
import { IdempotencyConflictError } from "../repositories/settlementRepository.js";
import { AccountClosedError } from "../repositories/accountsRepository.js";

function handleIdempotencyConflict(error: unknown, res: Response): boolean {
  if (error instanceof IdempotencyConflictError) {
    res.status(HttpStatus.CONFLICT).json({ error: { code: "IDEMPOTENCY_KEY_REUSED", details: [{ message: error.message }] } });
    return true;
  }
  return false;
}

function handleAccountClosed(error: unknown, res: Response): boolean {
  if (error instanceof AccountClosedError) {
    res.status(HttpStatus.CONFLICT).json({ error: { code: "ACCOUNT_CLOSED", details: [{ message: error.message }] } });
    return true;
  }
  return false;
}

const INTEGER = /^[0-9]+$/;

interface AmountBody {
  accountId?: unknown;
  asset?: unknown;
  amount?: unknown;
}

function parseAmountBody(body: AmountBody): { accountId: string; asset: string; amount: bigint } | null {
  if (typeof body.accountId !== "string" || typeof body.asset !== "string" || typeof body.amount !== "string" || !INTEGER.test(body.amount)) {
    return null;
  }
  return { accountId: body.accountId, asset: body.asset, amount: BigInt(body.amount) };
}

const balanceToJson = (balance: { available: bigint; held: bigint }) => ({
  available: balance.available.toString(),
  held: balance.held.toString(),
  total: balance.available.toString(),
});

const getBalance = async (req: Request<{ accountId: string }>, res: Response): Promise<void> => {
  const asset = typeof req.query.asset === "string" ? req.query.asset : "USD";
  const balance = await settlement.getBalance(db, req.params.accountId, asset);
  res.status(HttpStatus.OK).json({ data: { accountId: req.params.accountId, asset, ...balanceToJson(balance) }, meta: {} });
};

const hold = async (req: Request<unknown, unknown, AmountBody>, res: Response): Promise<void> => {
  const parsed = parseAmountBody(req.body);
  if (!parsed) {
    res.status(HttpStatus.BAD_REQUEST).json({ error: { code: "INVALID_REQUEST", details: [] } });
    return;
  }

  try {
    const balance = await settlement.hold(db, parsed.accountId, parsed.asset, parsed.amount);
    res.status(HttpStatus.OK).json({ data: balanceToJson(balance), meta: {} });
  } catch (error: unknown) {
    if (handleAccountClosed(error, res)) return;
    if (error instanceof InsufficientAvailableError) {
      res.status(HttpStatus.CONFLICT).json({ error: { code: "INSUFFICIENT_AVAILABLE", details: [{ message: error.message }] } });
      return;
    }
    throw error;
  }
};

const release = async (req: Request<unknown, unknown, AmountBody>, res: Response): Promise<void> => {
  const parsed = parseAmountBody(req.body);
  if (!parsed) {
    res.status(HttpStatus.BAD_REQUEST).json({ error: { code: "INVALID_REQUEST", details: [] } });
    return;
  }

  try {
    const balance = await settlement.release(db, parsed.accountId, parsed.asset, parsed.amount);
    res.status(HttpStatus.OK).json({ data: balanceToJson(balance), meta: {} });
  } catch (error: unknown) {
    if (error instanceof InsufficientHeldError) {
      res.status(HttpStatus.CONFLICT).json({ error: { code: "INSUFFICIENT_HELD", details: [{ message: error.message }] } });
      return;
    }
    throw error;
  }
};

function requireIdempotencyKey(req: { header(name: string): string | undefined }, res: Response): string | null {
  const key = req.header("Idempotency-Key");
  if (!key) {
    res.status(HttpStatus.BAD_REQUEST).json({ error: { code: "IDEMPOTENCY_KEY_REQUIRED", details: [] } });
    return null;
  }
  return key;
}

const deposit = async (req: Request<unknown, unknown, AmountBody>, res: Response): Promise<void> => {
  const key = requireIdempotencyKey(req, res);
  if (!key) return;

  const parsed = parseAmountBody(req.body);
  if (!parsed) {
    res.status(HttpStatus.BAD_REQUEST).json({ error: { code: "INVALID_REQUEST", details: [] } });
    return;
  }

  try {
    const balance = await settlement.withIdempotency(db, key, req.body, async (trx) => balanceToJson(await settlement.deposit(trx, parsed.accountId, parsed.asset, parsed.amount)));
    res.status(HttpStatus.OK).json({ data: balance, meta: {} });
  } catch (error: unknown) {
    if (handleIdempotencyConflict(error, res)) return;
    if (handleAccountClosed(error, res)) return;
    throw error;
  }
};

const withdraw = async (req: Request<unknown, unknown, AmountBody>, res: Response): Promise<void> => {
  const key = requireIdempotencyKey(req, res);
  if (!key) return;

  const parsed = parseAmountBody(req.body);
  if (!parsed) {
    res.status(HttpStatus.BAD_REQUEST).json({ error: { code: "INVALID_REQUEST", details: [] } });
    return;
  }

  try {
    const balance = await settlement.withIdempotency(db, key, req.body, async (trx) => balanceToJson(await settlement.withdraw(trx, parsed.accountId, parsed.asset, parsed.amount)));
    res.status(HttpStatus.OK).json({ data: balance, meta: {} });
  } catch (error: unknown) {
    if (handleIdempotencyConflict(error, res)) return;
    if (handleAccountClosed(error, res)) return;
    if (error instanceof Error && error.message.includes("does not have enough available")) {
      res.status(HttpStatus.CONFLICT).json({ error: { code: "INSUFFICIENT_AVAILABLE", details: [{ message: error.message }] } });
      return;
    }
    throw error;
  }
};

interface TradeBody {
  sellerAssetAccountId?: unknown;
  buyerAssetAccountId?: unknown;
  asset?: unknown;
  quantity?: unknown;
  buyerCashAccountId?: unknown;
  sellerCashAccountId?: unknown;
  cashAsset?: unknown;
  cashAmount?: unknown;
}

const settleTrade = async (req: Request<unknown, unknown, TradeBody>, res: Response): Promise<void> => {
  const b = req.body;
  const strings = [b.sellerAssetAccountId, b.buyerAssetAccountId, b.asset, b.buyerCashAccountId, b.sellerCashAccountId, b.cashAsset];
  const amounts = [b.quantity, b.cashAmount];

  if (strings.some((v) => typeof v !== "string") || amounts.some((v) => typeof v !== "string" || !INTEGER.test(v))) {
    res.status(HttpStatus.BAD_REQUEST).json({ error: { code: "INVALID_TRADE", details: [] } });
    return;
  }

  try {
    const entryId = await settlement.settleTrade(db, {
      sellerAssetAccountId: b.sellerAssetAccountId as string,
      buyerAssetAccountId: b.buyerAssetAccountId as string,
      asset: b.asset as string,
      quantity: BigInt(b.quantity as string),
      buyerCashAccountId: b.buyerCashAccountId as string,
      sellerCashAccountId: b.sellerCashAccountId as string,
      cashAsset: b.cashAsset as string,
      cashAmount: BigInt(b.cashAmount as string),
    });
    res.status(HttpStatus.CREATED).json({ data: { entryId }, meta: {} });
  } catch (error: unknown) {
    if (handleAccountClosed(error, res)) return;
    if (error instanceof InsufficientHeldError) {
      res.status(HttpStatus.CONFLICT).json({ error: { code: "INSUFFICIENT_HELD", details: [{ message: error.message }] } });
      return;
    }
    throw error;
  }
};

export default { getBalance, hold, release, deposit, withdraw, settleTrade };
