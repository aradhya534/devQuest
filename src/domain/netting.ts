import { NotImplementedError } from "./notImplemented.js";

/** `from` owes `to` the given amount (in the asset's minor units). */
export interface Obligation {
  id: string;
  from: string;
  to: string;
  asset: string;
  amount: bigint;
}

/** A physical payment: `from` pays `to`. */
export interface Transfer {
  from: string;
  to: string;
  asset: string;
  amount: bigint;
}

/** Multilateral netting: turns a batch of bilateral obligations into payments. See tests/challenge14.test.ts. */
export function netObligations(_obligations: readonly Obligation[]): Transfer[] {
  throw new NotImplementedError("netObligations");
}
