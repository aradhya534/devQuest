import { NotImplementedError } from "./notImplemented.js";

export interface Trade {
  sequence: number; // strictly increasing arrival order — ties in timestamp break by this, not by insertion order
  price: bigint;
  quantity: bigint;
  timestampMs: number;
}

export interface Candle {
  bucketStartMs: number;
  open: bigint;
  high: bigint;
  low: bigint;
  close: bigint;
  volume: bigint;
  tradeCount: number;
}

export function bucketStart(_timestampMs: number, _resolutionMs: number): number {
  throw new NotImplementedError("bucketStart");
}

/** Returns one candle per non-empty bucket, in ascending bucketStartMs order. */
export function aggregateCandles(_trades: readonly Trade[], _resolutionMs: number): Candle[] {
  throw new NotImplementedError("aggregateCandles");
}

export function fillGaps(_candles: readonly Candle[], _resolutionMs: number): Candle[] {
  throw new NotImplementedError("fillGaps");
}

export function rollUp(_candles: readonly Candle[]): Candle | null {
  throw new NotImplementedError("rollUp");
}

export function vwap(_trades: readonly Trade[]): { price: bigint; remainder: bigint } {
  throw new NotImplementedError("vwap");
}
