import { NotImplementedError } from "./notImplemented.js";

export type Side = "buy" | "sell";
export type TimeInForce = "GTC" | "IOC" | "FOK" | "POST_ONLY";

export interface RestingOrder {
  id: string;
  accountId: string;
  side: Side;
  price: bigint; // resting orders always carry a limit price
  quantity: bigint;
  filled: bigint;
  sequence: number; // insertion order, for FIFO within a price level
  timeInForce: TimeInForce;
}

function remaining(order: RestingOrder): bigint {
  return order.quantity - order.filled;
}

class BookSide {
  private readonly orders: RestingOrder[] = [];

  constructor(private readonly betterPrice: (a: bigint, b: bigint) => boolean) {}

  insert(_order: RestingOrder): void {
    void this.betterPrice; // available for price-time ordering — see availableLiquidity too
    throw new NotImplementedError("BookSide.insert");
  }

  best(): RestingOrder | undefined {
    return this.orders[0];
  }

  removeById(id: string): RestingOrder | undefined {
    const index = this.orders.findIndex((order) => order.id === id);
    if (index === -1) return undefined;
    const [removed] = this.orders.splice(index, 1);
    return removed;
  }

  removeFront(): void {
    this.orders.shift();
  }

  availableLiquidity(_limit: bigint | undefined, _excludeAccountId: string): bigint {
    throw new NotImplementedError("BookSide.availableLiquidity");
  }

  snapshot(): RestingOrder[] {
    return this.orders.map((order) => ({ ...order }));
  }
}

export class OrderBook {
  readonly bids = new BookSide((a, b) => a > b); // higher price is better for a bid
  readonly asks = new BookSide((a, b) => a < b); // lower price is better for an ask

  sideFor(side: Side): BookSide {
    return side === "buy" ? this.bids : this.asks;
  }

  oppositeSideFor(side: Side): BookSide {
    return side === "buy" ? this.asks : this.bids;
  }

  bestBid(): bigint | undefined {
    return this.bids.best()?.price;
  }

  bestAsk(): bigint | undefined {
    return this.asks.best()?.price;
  }

  isCrossed(): boolean {
    const bid = this.bestBid();
    const ask = this.bestAsk();
    return bid !== undefined && ask !== undefined && bid >= ask;
  }
}

export function remainingQuantity(order: RestingOrder): bigint {
  return remaining(order);
}
