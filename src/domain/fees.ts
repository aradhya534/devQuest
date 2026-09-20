import { NotImplementedError } from "./notImplemented.js";

/** One volume tier. Rates are integer basis points; a negative rate is a rebate. */
export interface FeeTier {
  minVolume: bigint;
  makerBps: bigint;
  takerBps: bigint;
}

export interface FeeOptions {
  feeAccount: string;
  windowMs: number;
}

export interface FeeFill {
  fillId: string;
  timestampMs: number;
  makerAccount: string;
  takerAccount: string;
  asset: string;
  notional: bigint;
}

export interface LedgerLine {
  account: string;
  asset: string;
  amount: bigint;
}

export interface LedgerEntry {
  entryId: string;
  lines: LedgerLine[];
}

export interface FeeResult {
  fillId: string;
  makerFee: bigint;
  takerFee: bigint;
  entries: LedgerEntry[];
}

/** Maker/taker fee engine. See tests/challenge16.test.ts. */
export class FeeEngine {
  constructor(_schedule: readonly FeeTier[], _options: FeeOptions) {
    throw new NotImplementedError("FeeEngine");
  }

  processFill(_fill: FeeFill): FeeResult {
    throw new NotImplementedError("FeeEngine.processFill");
  }

  trailingVolume(_account: string, _atMs: number): bigint {
    throw new NotImplementedError("FeeEngine.trailingVolume");
  }
}
