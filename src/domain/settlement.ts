import { NotImplementedError } from "./notImplemented.js";

export class InsufficientAvailableError extends Error {
  constructor(accountId: string, asset: string) {
    super(`Account ${accountId} does not have enough available ${asset} to hold this amount`);
  }
}

export class InsufficientHeldError extends Error {
  constructor(accountId: string, asset: string) {
    super(`Account ${accountId} does not have enough held ${asset} to release this amount`);
  }
}

export interface AccountBalance {
  available: bigint;
  held: bigint;
}

export function applyHold(_balance: AccountBalance, _amount: bigint, _accountId: string, _asset: string): AccountBalance {
  throw new NotImplementedError("applyHold");
}

export function applyRelease(_balance: AccountBalance, _amount: bigint, _accountId: string, _asset: string): AccountBalance {
  throw new NotImplementedError("applyRelease");
}
