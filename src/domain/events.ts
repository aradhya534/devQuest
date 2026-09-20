import { NotImplementedError } from "./notImplemented.js";

export interface StoredEvent {
  seq: number;
  type: string;
  accountId: string;
  asset: string;
  amount: string; // decimal-string minor units, kept as text through hashing and storage
  hash: string;
  prevHash: string | null;
}

export function computeHash(_prevHash: string | null, _seq: number, _type: string, _accountId: string, _asset: string, _amount: string): string {
  throw new NotImplementedError("computeHash");
}

export type Balances = Map<string, bigint>; // key: `${accountId}:${asset}`

export function emptyBalances(): Balances {
  return new Map();
}

export function replay(_events: readonly StoredEvent[], _startingBalances: Balances = emptyBalances()): Balances {
  throw new NotImplementedError("replay");
}

export interface ChainVerification {
  valid: boolean;
  firstBrokenSeq: number | null;
}

export function verifyChain(_events: readonly StoredEvent[]): ChainVerification {
  throw new NotImplementedError("verifyChain");
}

export function balancesToJson(_balances: Balances): Record<string, string> {
  throw new NotImplementedError("balancesToJson");
}

export function balancesFromJson(_json: Record<string, string>): Balances {
  throw new NotImplementedError("balancesFromJson");
}
