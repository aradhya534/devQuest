import { OrderBook, type RestingOrder, type Side, type TimeInForce } from "./orderBook.js";
import { NotImplementedError } from "./notImplemented.js";

export interface Trade {
  buyOrderId: string;
  sellOrderId: string;
  price: bigint; // always the resting (maker) order's price
  quantity: bigint;
}

export interface Cancellation {
  orderId: string;
  reason: "self_trade_prevention";
}

export interface IncomingOrder {
  id: string;
  accountId: string;
  side: Side;
  price?: bigint; // absent for a market order
  quantity: bigint;
  timeInForce: TimeInForce;
  sequence: number;
  orderType?: "limit" | "market" | "stop" | "stop_limit"; // defaults to "limit" (price set) or "market" (no price) when absent
  stopPrice?: bigint; // required when orderType is "stop" or "stop_limit"
}

export interface SubmitResult {
  trades: Trade[];
  cancellations: Cancellation[];
  restingOrder: RestingOrder | null; // non-null only if quantity remains and it joined the book
  rejected: boolean;
  rejectionReason?: "would_cross" | "insufficient_liquidity_for_fill_or_kill";
}

export function submitOrder(_book: OrderBook, _incoming: IncomingOrder): SubmitResult {
  throw new NotImplementedError("submitOrder");
}

export interface CancelResult {
  cancelled: RestingOrder | null;
}

export function cancelOrder(book: OrderBook, side: Side, orderId: string): CancelResult {
  const cancelled = book.sideFor(side).removeById(orderId) ?? null;
  return { cancelled };
}

export interface AmendResult {
  amended: RestingOrder | null;
}

export function amendOrder(_book: OrderBook, _side: Side, _orderId: string, _newPrice: bigint | undefined, _newQuantity: bigint | undefined): AmendResult {
  throw new NotImplementedError("amendOrder");
}
