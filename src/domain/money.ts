import { NotImplementedError } from "./notImplemented.js";

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

export function parseAmount(_raw: unknown, _assetCode: string): Money {
  throw new NotImplementedError("parseAmount");
}

export function serialiseAmount(_money: Money): { amount: string; asset: string } {
  throw new NotImplementedError("serialiseAmount");
}

export function add(_a: Money, _b: Money): Money {
  throw new NotImplementedError("add");
}

export function sub(_a: Money, _b: Money): Money {
  throw new NotImplementedError("sub");
}

export function isNegative(_money: Money): boolean {
  throw new NotImplementedError("isNegative");
}

export function compare(_a: Money, _b: Money): -1 | 0 | 1 {
  throw new NotImplementedError("compare");
}

export function fromDecimal(_raw: unknown, _assetCode: string): Money {
  throw new NotImplementedError("fromDecimal");
}

export function toDecimal(_money: Money): string {
  throw new NotImplementedError("toDecimal");
}

export enum Rounding {
  HALF_UP = "HALF_UP",
  HALF_EVEN = "HALF_EVEN",
}

export interface DivisionResult {
  quotient: bigint;
  remainder: bigint;
}

export function divideWithRounding(_dividend: bigint, _divisor: bigint, _mode: Rounding = Rounding.HALF_EVEN): DivisionResult {
  throw new NotImplementedError("divideWithRounding");
}

export interface RateApplication {
  result: Money;
  remainder: Money;
}

export function applyRate(_money: Money, _numerator: bigint, _denominator: bigint, _mode: Rounding = Rounding.HALF_EVEN): RateApplication {
  throw new NotImplementedError("applyRate");
}
