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

interface PriceLevel {
  price: bigint;
  orders: RestingOrder[];
}

class BookSide {
  private readonly prices: bigint[] = [];
  private readonly priceLevels = new Map<bigint, PriceLevel>();
  private readonly orderToLevel = new Map<string, PriceLevel>();

  constructor(private readonly betterPrice: (a: bigint, b: bigint) => boolean) {}

  insert(order: RestingOrder): void {
    let level = this.priceLevels.get(order.price);
    if (level) {
      if (level.orders.length === 0 || order.sequence >= level.orders[level.orders.length - 1]!.sequence) {
        level.orders.push(order);
      } else {
        let low = 0;
        let high = level.orders.length;
        while (low < high) {
          const mid = (low + high) >>> 1;
          if (order.sequence < level.orders[mid]!.sequence) {
            high = mid;
          } else {
            low = mid + 1;
          }
        }
        level.orders.splice(low, 0, order);
      }
      this.orderToLevel.set(order.id, level);
    } else {
      level = { price: order.price, orders: [order] };
      this.priceLevels.set(order.price, level);
      this.orderToLevel.set(order.id, level);

      let low = 0;
      let high = this.prices.length;
      while (low < high) {
        const mid = (low + high) >>> 1;
        if (this.betterPrice(order.price, this.prices[mid]!)) {
          high = mid;
        } else {
          low = mid + 1;
        }
      }
      this.prices.splice(low, 0, order.price);
    }
  }

  best(): RestingOrder | undefined {
    if (this.prices.length === 0) return undefined;
    const level = this.priceLevels.get(this.prices[0]!);
    return level?.orders[0];
  }

  removeById(id: string): RestingOrder | undefined {
    const level = this.orderToLevel.get(id);
    if (!level) return undefined;
    const index = level.orders.findIndex((order) => order.id === id);
    if (index === -1) return undefined;
    const [removed] = level.orders.splice(index, 1);
    this.orderToLevel.delete(id);

    if (level.orders.length === 0) {
      this.priceLevels.delete(level.price);
      let low = 0;
      let high = this.prices.length;
      while (low < high) {
        const mid = (low + high) >>> 1;
        if (this.prices[mid] === level.price) {
          this.prices.splice(mid, 1);
          break;
        } else if (this.betterPrice(level.price, this.prices[mid]!)) {
          high = mid;
        } else {
          low = mid + 1;
        }
      }
    }

    return removed;
  }

  removeFront(): void {
    if (this.prices.length === 0) return;
    const bestPrice = this.prices[0]!;
    const level = this.priceLevels.get(bestPrice);
    if (!level || level.orders.length === 0) return;
    const removed = level.orders.shift();
    if (removed) {
      this.orderToLevel.delete(removed.id);
    }
    if (level.orders.length === 0) {
      this.priceLevels.delete(bestPrice);
      this.prices.shift();
    }
  }

  availableLiquidity(limit: bigint | undefined, excludeAccountId: string): bigint {
    let total = 0n;
    for (const price of this.prices) {
      if (limit !== undefined && this.betterPrice(limit, price)) {
        break;
      }
      const level = this.priceLevels.get(price);
      if (level) {
        for (const order of level.orders) {
          if (order.accountId !== excludeAccountId) {
            total += order.quantity - order.filled;
          }
        }
      }
    }
    return total;
  }

  snapshot(): RestingOrder[] {
    const result: RestingOrder[] = [];
    for (const price of this.prices) {
      const level = this.priceLevels.get(price);
      if (level) {
        for (const order of level.orders) {
          result.push({ ...order });
        }
      }
    }
    return result;
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
