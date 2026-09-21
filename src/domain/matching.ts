import { OrderBook, type RestingOrder, type Side, type TimeInForce } from "./orderBook.js";

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

function crosses(incoming: IncomingOrder, restingPrice: bigint): boolean {
  if (incoming.price === undefined) return true;
  return incoming.side === "buy" ? incoming.price >= restingPrice : incoming.price <= restingPrice;
}

export function submitOrder(book: OrderBook, incoming: IncomingOrder): SubmitResult {
  const oppositeSide = book.oppositeSideFor(incoming.side);
  const sameSide = book.sideFor(incoming.side);

  if (incoming.timeInForce === "POST_ONLY") {
    const best = oppositeSide.best();
    if (best && crosses(incoming, best.price)) {
      return {
        trades: [],
        cancellations: [],
        restingOrder: null,
        rejected: true,
        rejectionReason: "would_cross",
      };
    }
  }

  if (incoming.timeInForce === "FOK") {
    const available = oppositeSide.availableLiquidity(incoming.price, incoming.accountId);
    if (available < incoming.quantity) {
      return {
        trades: [],
        cancellations: [],
        restingOrder: null,
        rejected: true,
        rejectionReason: "insufficient_liquidity_for_fill_or_kill",
      };
    }
  }

  let remainingQty = incoming.quantity;
  const trades: Trade[] = [];
  const cancellations: Cancellation[] = [];

  while (remainingQty > 0n) {
    const best = oppositeSide.best();
    if (!best || !crosses(incoming, best.price)) {
      break;
    }

    if (best.accountId === incoming.accountId) {
      oppositeSide.removeFront();
      cancellations.push({ orderId: best.id, reason: "self_trade_prevention" });
      continue;
    }

    const restingRemaining = best.quantity - best.filled;
    const tradeQty = remainingQty < restingRemaining ? remainingQty : restingRemaining;

    trades.push({
      buyOrderId: incoming.side === "buy" ? incoming.id : best.id,
      sellOrderId: incoming.side === "buy" ? best.id : incoming.id,
      price: best.price,
      quantity: tradeQty,
    });

    best.filled += tradeQty;
    remainingQty -= tradeQty;

    if (best.filled >= best.quantity) {
      oppositeSide.removeFront();
    }
  }

  let restingOrder: RestingOrder | null = null;
  if (remainingQty > 0n && incoming.timeInForce !== "IOC" && incoming.timeInForce !== "FOK" && incoming.price !== undefined) {
    restingOrder = {
      id: incoming.id,
      accountId: incoming.accountId,
      side: incoming.side,
      price: incoming.price,
      quantity: incoming.quantity,
      filled: incoming.quantity - remainingQty,
      sequence: incoming.sequence,
      timeInForce: incoming.timeInForce,
    };
    sameSide.insert(restingOrder);
  }

  return {
    trades,
    cancellations,
    restingOrder,
    rejected: false,
  };
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

export function amendOrder(
  book: OrderBook,
  side: Side,
  orderId: string,
  newPrice: bigint | undefined,
  newQuantity: bigint | undefined,
  newSequence?: number,
): AmendResult {
  const sideBook = book.sideFor(side);
  const snapshot = sideBook.snapshot();
  const existing = snapshot.find((o) => o.id === orderId);
  if (!existing || existing.quantity <= existing.filled) {
    return { amended: null };
  }

  const isPriceChanged = newPrice !== undefined && newPrice !== existing.price;
  const isQuantityIncreased = newQuantity !== undefined && newQuantity > existing.quantity;

  const removed = sideBook.removeById(orderId);
  if (!removed) {
    return { amended: null };
  }

  if (newPrice !== undefined) removed.price = newPrice;
  if (newQuantity !== undefined) removed.quantity = newQuantity;

  if (isPriceChanged || isQuantityIncreased) {
    if (newSequence !== undefined) {
      removed.sequence = newSequence;
    }
  }

  sideBook.insert(removed);
  return { amended: { ...removed } };
}
