import { NotImplementedError } from "./notImplemented.js";

export enum AccountType {
  ASSET = "asset",
  LIABILITY = "liability",
  EQUITY = "equity",
  REVENUE = "revenue",
  EXPENSE = "expense",
}

export function isDebitNormal(_type: AccountType): boolean {
  throw new NotImplementedError("isDebitNormal");
}

export interface PostingInput {
  accountId: string;
  asset: string;
  amount: bigint; // signed: positive is a debit, negative a credit
}

export class UnbalancedEntryError extends Error {
  constructor(public readonly imbalances: Map<string, bigint>) {
    const detail = [...imbalances.entries()].map(([asset, sum]) => `${asset}=${sum}`).join(", ");
    super(`Entry does not balance per asset: ${detail}`);
  }
}

export function assertBalanced(_postings: readonly PostingInput[]): void {
  throw new NotImplementedError("assertBalanced");
}

export function reversePostings(_postings: readonly PostingInput[]): PostingInput[] {
  throw new NotImplementedError("reversePostings");
}
