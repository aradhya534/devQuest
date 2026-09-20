import { OrderBook, type Side } from "../domain/orderBook.js";
import { submitOrder, cancelOrder, amendOrder, type IncomingOrder, type SubmitResult } from "../domain/matching.js";
import { NotImplementedError } from "../domain/notImplemented.js";

const books = new Map<string, OrderBook>();
const registry = new Map<string, { market: string; side: Side }>(); // orderId -> where to find it, for cancel

let sequenceCounter = 0;
function nextSequence(): number {
  sequenceCounter += 1;
  return sequenceCounter;
}

function bookFor(market: string): OrderBook {
  let book = books.get(market);
  if (!book) {
    book = new OrderBook();
    books.set(market, book);
  }
  return book;
}

export function placeOrder(market: string, order: Omit<IncomingOrder, "sequence">): SubmitResult {
  if (order.orderType === "stop" || order.orderType === "stop_limit") {
    throw new NotImplementedError("stop and stop_limit orders");
  }

  const book = bookFor(market);
  const result = submitOrder(book, { ...order, sequence: nextSequence() });
  if (result.restingOrder) {
    registry.set(order.id, { market, side: order.side });
  }
  for (const cancellation of result.cancellations) {
    registry.delete(cancellation.orderId);
  }
  return result;
}

export function cancel(orderId: string): { found: boolean; cancelled: boolean } {
  const location = registry.get(orderId);
  if (!location) return { found: true, cancelled: false };

  const book = bookFor(location.market);
  const { cancelled } = cancelOrder(book, location.side, orderId);
  registry.delete(orderId);
  return { found: true, cancelled: cancelled !== null };
}

export function bestPrices(market: string): { bestBid: string | null; bestAsk: string | null } {
  const book = books.get(market);
  return {
    bestBid: book?.bestBid()?.toString() ?? "0",
    bestAsk: book?.bestAsk()?.toString() ?? "0",
  };
}

// Aggregated depth for the dashboard: one entry per price level, best price first, with the remaining
// (unfilled) quantity of every resting order at that price summed.
export function depth(market: string): { bids: { price: string; quantity: string }[]; asks: { price: string; quantity: string }[] } {
  const book = books.get(market);
  const levels = (orders: { price: bigint; quantity: bigint; filled: bigint }[]): { price: string; quantity: string }[] => {
    const byPrice = new Map<string, bigint>();
    for (const order of orders) {
      const key = order.price.toString();
      byPrice.set(key, (byPrice.get(key) ?? 0n) + (order.quantity - order.filled));
    }
    return [...byPrice.entries()].map(([price, quantity]) => ({ price, quantity: quantity.toString() }));
  };
  return { bids: levels(book?.bids.snapshot() ?? []), asks: levels(book?.asks.snapshot() ?? []) };
}

export interface TradeRecord {
  market: string;
  buyOrderId: string;
  sellOrderId: string;
  buyAccountId: string | null;
  sellAccountId: string | null;
  takerSide: "buy" | "sell";
  price: string;
  quantity: string;
  timestampMs: number;
}

const orderAccounts = new Map<string, string>();

export function rememberOrder(orderId: string, accountId: string): void {
  orderAccounts.set(orderId, accountId);
}

export function marketOf(orderId: string): string | undefined {
  return registry.get(orderId)?.market;
}

const tradeLog: TradeRecord[] = [];
const MAX_TRADE_LOG = 200;

export function recordTrades(market: string, trades: { buyOrderId: string; sellOrderId: string; price: bigint; quantity: bigint }[], takerSide: "buy" | "sell"): void {
  for (const trade of trades) {
    tradeLog.push({
      market,
      buyOrderId: trade.buyOrderId,
      sellOrderId: trade.sellOrderId,
      buyAccountId: orderAccounts.get(trade.buyOrderId) ?? null,
      sellAccountId: orderAccounts.get(trade.sellOrderId) ?? null,
      takerSide,
      price: trade.price.toString(),
      quantity: trade.quantity.toString(),
      timestampMs: Date.now(),
    });
  }
  if (tradeLog.length > MAX_TRADE_LOG) tradeLog.splice(0, tradeLog.length - MAX_TRADE_LOG);
}

export function recentTrades(limit: number): TradeRecord[] {
  return tradeLog.slice(-limit).reverse();
}

export function isCrossed(market: string): boolean {
  return books.get(market)?.isCrossed() ?? false;
}

export function resetAllBooks(): void {
  books.clear();
  registry.clear();
  tradeLog.length = 0;
  orderAccounts.clear();
  sequenceCounter = 0;
}

export function amend(orderId: string, newPrice: bigint | undefined, newQuantity: bigint | undefined): { found: boolean; amended: import("../domain/matching.js").AmendResult["amended"] } {
  const location = registry.get(orderId);
  if (!location) return { found: false, amended: null };

  const book = bookFor(location.market);
  const { amended } = amendOrder(book, location.side, orderId, newPrice, newQuantity);
  return { found: true, amended };
}
