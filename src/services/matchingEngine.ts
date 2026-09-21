import { OrderBook, type Side } from "../domain/orderBook.js";
import { submitOrder, cancelOrder, amendOrder, type IncomingOrder, type SubmitResult } from "../domain/matching.js";

const books = new Map<string, OrderBook>();
const registry = new Map<string, { market: string; side: Side }>(); // orderId -> where to find it, for cancel
const lastTradePrices = new Map<string, bigint>();
const pendingStops = new Map<string, Array<Omit<IncomingOrder, "sequence">>>();

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

function isStopTriggered(side: Side, stopPrice: bigint, lastPrice: bigint | undefined): boolean {
  if (lastPrice === undefined) return false;
  return side === "buy" ? lastPrice >= stopPrice : lastPrice <= stopPrice;
}

function processOrder(market: string, incoming: IncomingOrder): SubmitResult {
  const book = bookFor(market);
  const result = submitOrder(book, incoming);

  if (result.restingOrder) {
    registry.set(incoming.id, { market, side: incoming.side });
  }
  for (const cancellation of result.cancellations) {
    registry.delete(cancellation.orderId);
  }

  if (result.trades.length > 0) {
    const lastPrice = result.trades[result.trades.length - 1]!.price;
    lastTradePrices.set(market, lastPrice);

    const stops = pendingStops.get(market);
    if (stops && stops.length > 0) {
      let triggeredIndex = -1;
      while ((triggeredIndex = stops.findIndex((s) => isStopTriggered(s.side, s.stopPrice!, lastTradePrices.get(market)))) !== -1) {
        const [triggered] = stops.splice(triggeredIndex, 1);
        if (!triggered) break;
        const convertedOrder: IncomingOrder = {
          ...triggered,
          sequence: nextSequence(),
          orderType: triggered.orderType === "stop" ? "market" : "limit",
          price: triggered.orderType === "stop" ? undefined : triggered.price,
          timeInForce: triggered.orderType === "stop" ? "IOC" : (triggered.timeInForce ?? "GTC"),
        };
        const stopResult = processOrder(market, convertedOrder);
        result.trades.push(...stopResult.trades);
        result.cancellations.push(...stopResult.cancellations);
      }
    }
  }

  return result;
}

export function placeOrder(market: string, order: Omit<IncomingOrder, "sequence">): SubmitResult {
  const lastPrice = lastTradePrices.get(market);

  if (order.orderType === "stop" || order.orderType === "stop_limit") {
    if (isStopTriggered(order.side, order.stopPrice!, lastPrice)) {
      const convertedOrder: IncomingOrder = {
        ...order,
        sequence: nextSequence(),
        orderType: order.orderType === "stop" ? "market" : "limit",
        price: order.orderType === "stop" ? undefined : order.price,
        timeInForce: order.orderType === "stop" ? "IOC" : (order.timeInForce ?? "GTC"),
      };
      return processOrder(market, convertedOrder);
    } else {
      let stops = pendingStops.get(market);
      if (!stops) {
        stops = [];
        pendingStops.set(market, stops);
      }
      stops.push(order);
      return {
        trades: [],
        cancellations: [],
        restingOrder: null,
        rejected: false,
      };
    }
  }

  return processOrder(market, { ...order, sequence: nextSequence() });
}

export function cancel(orderId: string): { found: boolean; cancelled: boolean } {
  for (const [, stops] of pendingStops) {
    const idx = stops.findIndex((s) => s.id === orderId);
    if (idx !== -1) {
      stops.splice(idx, 1);
      return { found: true, cancelled: true };
    }
  }

  const location = registry.get(orderId);
  if (!location) return { found: false, cancelled: false };

  const book = bookFor(location.market);
  const { cancelled } = cancelOrder(book, location.side, orderId);
  registry.delete(orderId);
  return { found: true, cancelled: cancelled !== null };
}

export function bestPrices(market: string): { bestBid: string | null; bestAsk: string | null } {
  const book = books.get(market);
  return {
    bestBid: book?.bestBid()?.toString() ?? null,
    bestAsk: book?.bestAsk()?.toString() ?? null,
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
  lastTradePrices.clear();
  pendingStops.clear();
  sequenceCounter = 0;
}

export function amend(orderId: string, newPrice: bigint | undefined, newQuantity: bigint | undefined): { found: boolean; amended: import("../domain/matching.js").AmendResult["amended"] } {
  const location = registry.get(orderId);
  if (!location) return { found: false, amended: null };

  const book = bookFor(location.market);
  const seq = nextSequence();
  const { amended } = amendOrder(book, location.side, orderId, newPrice, newQuantity, seq);
  return { found: true, amended };
}
