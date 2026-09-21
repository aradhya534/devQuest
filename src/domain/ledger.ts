export enum AccountType {
  ASSET = "asset",
  LIABILITY = "liability",
  EQUITY = "equity",
  REVENUE = "revenue",
  EXPENSE = "expense",
}

export function isDebitNormal(type: AccountType): boolean {
  return type === AccountType.ASSET || type === AccountType.EXPENSE;
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

export function assertBalanced(postings: readonly PostingInput[]): void {
  const sums = new Map<string, bigint>();
  for (const p of postings) {
    const current = sums.get(p.asset) ?? 0n;
    sums.set(p.asset, current + p.amount);
  }
  const imbalances = new Map<string, bigint>();
  for (const [asset, sum] of sums) {
    if (sum !== 0n) {
      imbalances.set(asset, sum);
    }
  }
  if (imbalances.size > 0) {
    throw new UnbalancedEntryError(imbalances);
  }
}

export function reversePostings(postings: readonly PostingInput[]): PostingInput[] {
  return postings.map((p) => ({
    accountId: p.accountId,
    asset: p.asset,
    amount: -p.amount,
  }));
}
