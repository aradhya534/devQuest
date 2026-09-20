import { NotImplementedError } from "./notImplemented.js";

export type RiskViolation = "MAX_NOTIONAL" | "MAX_OPEN_ORDERS" | "MAX_POSITION";

export interface RiskLimits {
  maxNotional: bigint;
  maxOpenOrders: number;
  maxPositionAbs: bigint;
}

export interface RiskState {
  openOrderCount: number;
  committedExposure: bigint; // signed: net of resting buy quantity minus resting sell quantity
}

export interface OrderForRiskCheck {
  side: "buy" | "sell";
  price: bigint | undefined;
  quantity: bigint;
  willRest: boolean; // whether this order, if accepted, joins the book (and so holds open-order and exposure slots)
}

export function firstViolatedRule(_state: RiskState, _limits: RiskLimits, _order: OrderForRiskCheck): RiskViolation | null {
  throw new NotImplementedError("firstViolatedRule");
}

// Commits an accepted, resting order's slots against the account's risk
// state — call after firstViolatedRule reports no violation.
export function reserve(_state: RiskState, _order: OrderForRiskCheck): RiskState {
  throw new NotImplementedError("reserve");
}

// Reverses a prior reserve() when a reserved order is cancelled or rejected
// after the fact (e.g. a self-trade-prevention cancel from the matching engine).
export function release(_state: RiskState, _side: "buy" | "sell", _quantity: bigint): RiskState {
  throw new NotImplementedError("release");
}
