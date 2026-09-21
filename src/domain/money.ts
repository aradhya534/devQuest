import { getAsset, isKnownAsset } from "./assets.js";

export interface Money {
  amount: bigint;
  asset: string;
}

export class MoneyError extends Error {
  code: string;

  constructor(message: string, code: string = "INVALID_AMOUNT") {
    super(message);
    this.code = code;
  }
}

const MAX_INT64 = 9223372036854775807n;

export function parseAmount(raw: unknown, assetCode: string): Money {
  if (typeof raw !== "string") {
    throw new MoneyError("Amount must be a string", "INVALID_AMOUNT");
  }

  // Reject empty string, signs (+/-), leading zeros (unless single '0'), decimals, exponents, non-ASCII digits
  if (!/^(?:0|[1-9]\d*)$/.test(raw)) {
    throw new MoneyError(`Malformed amount string: ${raw}`, "INVALID_AMOUNT");
  }

  if (!isKnownAsset(assetCode)) {
    throw new MoneyError(`Unknown asset: ${assetCode}`, "INVALID_ASSET");
  }

  const amount = BigInt(raw);
  if (amount > MAX_INT64) {
    throw new MoneyError(`Amount exceeds signed 64-bit max integer: ${raw}`, "AMOUNT_TOO_LARGE");
  }

  return { amount, asset: assetCode.toUpperCase() };
}

export function serialiseAmount(money: Money): { amount: string; asset: string } {
  return {
    amount: money.amount.toString(),
    asset: money.asset,
  };
}

export function add(a: Money, b: Money): Money {
  if (a.asset !== b.asset) {
    throw new MoneyError(`Asset mismatch: ${a.asset} vs ${b.asset}`, "ASSET_MISMATCH");
  }
  return { amount: a.amount + b.amount, asset: a.asset };
}

export function sub(a: Money, b: Money): Money {
  if (a.asset !== b.asset) {
    throw new MoneyError(`Asset mismatch: ${a.asset} vs ${b.asset}`, "ASSET_MISMATCH");
  }
  return { amount: a.amount - b.amount, asset: a.asset };
}

export function isNegative(money: Money): boolean {
  return money.amount < 0n;
}

export function compare(a: Money, b: Money): -1 | 0 | 1 {
  if (a.asset !== b.asset) {
    throw new MoneyError(`Asset mismatch: ${a.asset} vs ${b.asset}`, "ASSET_MISMATCH");
  }
  if (a.amount < b.amount) return -1;
  if (a.amount > b.amount) return 1;
  return 0;
}

export function fromDecimal(raw: unknown, assetCode: string): Money {
  if (typeof raw !== "string") {
    throw new MoneyError("Decimal amount must be a string", "INVALID_AMOUNT");
  }

  if (!/^-?(?:0|[1-9]\d*)(?:\.\d+)?$/.test(raw)) {
    throw new MoneyError(`Malformed decimal string: ${raw}`, "INVALID_AMOUNT");
  }

  const asset = getAsset(assetCode);
  const isNeg = raw.startsWith("-");
  const unsignedRaw = isNeg ? raw.slice(1) : raw;

  const [intPart = "0", fracPart = ""] = unsignedRaw.split(".");

  if (fracPart.length > asset.exponent) {
    throw new MoneyError(`Decimal precision (${fracPart.length}) exceeds asset exponent (${asset.exponent})`, "EXCESS_PRECISION");
  }

  const paddedFrac = fracPart.padEnd(asset.exponent, "0");
  const combined = intPart + paddedFrac;
  const rawBigInt = BigInt(combined);
  const amount = isNeg ? -rawBigInt : rawBigInt;

  return { amount, asset: asset.code };
}

export function toDecimal(money: Money): string {
  const asset = getAsset(money.asset);
  const isNeg = money.amount < 0n;
  const absAmount = isNeg ? -money.amount : money.amount;

  if (asset.exponent === 0) {
    return money.amount.toString();
  }

  const str = absAmount.toString().padStart(asset.exponent + 1, "0");
  const intPart = str.slice(0, -asset.exponent);
  const fracPart = str.slice(-asset.exponent);

  const prefix = isNeg ? "-" : "";
  return `${prefix}${intPart}.${fracPart}`;
}

export enum Rounding {
  HALF_UP = "HALF_UP",
  HALF_EVEN = "HALF_EVEN",
}

export interface DivisionResult {
  quotient: bigint;
  remainder: bigint;
}

export function divideWithRounding(dividend: bigint, divisor: bigint, mode: Rounding = Rounding.HALF_EVEN): DivisionResult {
  if (divisor === 0n) {
    throw new MoneyError("Division by zero", "DIVISION_BY_ZERO");
  }

  const sign = (dividend < 0n) !== (divisor < 0n) ? -1n : 1n;
  const absDividend = dividend < 0n ? -dividend : dividend;
  const absDivisor = divisor < 0n ? -divisor : divisor;

  const q = absDividend / absDivisor;
  const rem = absDividend % absDivisor;
  const doubleRem = rem * 2n;

  let roundedQ = q;
  if (doubleRem > absDivisor) {
    roundedQ = q + 1n;
  } else if (doubleRem === absDivisor) {
    if (mode === Rounding.HALF_UP) {
      roundedQ = q + 1n;
    } else {
      // HALF_EVEN
      roundedQ = q % 2n === 0n ? q : q + 1n;
    }
  }

  const quotient = sign * roundedQ;
  const remainder = dividend - quotient * divisor;

  return { quotient, remainder };
}

export interface RateApplication {
  result: Money;
  remainder: Money;
}

export function applyRate(money: Money, numerator: bigint, denominator: bigint, mode: Rounding = Rounding.HALF_EVEN): RateApplication {
  const { quotient, remainder } = divideWithRounding(money.amount * numerator, denominator, mode);
  return {
    result: { amount: quotient, asset: money.asset },
    remainder: { amount: remainder, asset: money.asset },
  };
}
