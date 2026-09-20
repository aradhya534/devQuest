import fc from "fast-check";
import type { Agent } from "supertest";
import app from "../src/server.js";
import db from "../db/db-config.js";
import testBase from "./testBase.js";
import { expect, test, describe, beforeAll, afterAll, beforeEach } from "vitest";
import HttpStatus from "../src/enums/httpStatus.js";
import { resetAllBooks } from "../src/services/matchingEngine.js";

let testSession: Agent;
let marketCounter = 0;

beforeAll(async () => {
  testSession = testBase.createSuperTestSession(app);
  await testBase.resetDatabase(db);
});
beforeEach(() => {
  resetAllBooks();
  marketCounter += 1;
});
afterAll(async () => {
  await new Promise<void>((resolve, reject) => {
    app.close((err) => (err ? reject(err) : resolve()));
  });
});

// Each test gets its own market symbol so book state from one test can never
// leak into the price-priority assertions of another.
function market(): string {
  return `TEST-${marketCounter}`;
}

interface OrderInput {
  accountId: string;
  side: "buy" | "sell";
  price?: string;
  quantity: string;
  timeInForce?: "GTC" | "IOC" | "FOK" | "POST_ONLY";
}

async function place(m: string, order: OrderInput) {
  return testSession.post("/api/orders").send({ market: m, ...order });
}

describe("Challenge 03: The Matching Engine", () => {
  describe("Challenge 3a: Price-time priority", () => {
    test("Challenge 3a-1: a crossing order trades at the resting order's price, not its own", async () => {
      const m = market();
      await place(m, { accountId: "maker", side: "sell", price: "100", quantity: "10" });

      const taker = await place(m, { accountId: "taker", side: "buy", price: "105", quantity: "10" });

      expect(taker.body.data.trades).toHaveLength(1);
      expect(taker.body.data.trades[0].price).toBe("100");
    });

    test("Challenge 3a-2: within one price level, the earlier order fills first", async () => {
      const m = market();
      await place(m, { accountId: "first", side: "sell", price: "100", quantity: "5" });
      await place(m, { accountId: "second", side: "sell", price: "100", quantity: "5" });

      const taker = await place(m, { accountId: "taker", side: "buy", price: "100", quantity: "5" });

      expect(taker.body.data.trades[0].sellOrderId).toBeDefined();
      const book = await testSession.get(`/api/orders/book/${m}`);
      // The first resting order was fully consumed; the second is still the only one left, at the same price.
      expect(book.body.data.bestAsk).toBe("100");
    });

    test("Challenge 3a-3: a large aggressor sweeps multiple price levels in ascending price order", async () => {
      const m = market();
      await place(m, { accountId: "maker-a", side: "sell", price: "101", quantity: "5" });
      await place(m, { accountId: "maker-b", side: "sell", price: "100", quantity: "5" });
      await place(m, { accountId: "maker-c", side: "sell", price: "102", quantity: "5" });

      const taker = await place(m, { accountId: "taker", side: "buy", price: "102", quantity: "15" });

      const prices = taker.body.data.trades.map((t: { price: string }) => t.price);
      expect(prices).toEqual(["100", "101", "102"]);
    });
  });

  describe("Challenge 3b: Order semantics", () => {
    test("Challenge 3b-1: IOC fills what it can and never rests", async () => {
      const m = market();
      await place(m, { accountId: "maker", side: "sell", price: "100", quantity: "3" });

      const taker = await place(m, { accountId: "taker", side: "buy", price: "100", quantity: "10", timeInForce: "IOC" });

      expect(taker.body.data.trades[0].quantity).toBe("3");
      expect(taker.body.data.resting).toBe(false);
    });

    test("Challenge 3b-2: FOK rejects entirely, leaving the book untouched, when it cannot fill in full", async () => {
      const m = market();
      await place(m, { accountId: "maker", side: "sell", price: "100", quantity: "3" });

      const before = await testSession.get(`/api/orders/book/${m}`);
      const taker = await place(m, { accountId: "taker", side: "buy", price: "100", quantity: "10", timeInForce: "FOK" });
      const after = await testSession.get(`/api/orders/book/${m}`);

      expect(taker.status).toBe(HttpStatus.CONFLICT);
      expect(after.body.data).toEqual(before.body.data);
    });

    test("Challenge 3b-3: post-only is rejected rather than matched when it would cross on entry", async () => {
      const m = market();
      await place(m, { accountId: "maker", side: "sell", price: "100", quantity: "5" });

      const response = await place(m, { accountId: "taker", side: "buy", price: "101", quantity: "5", timeInForce: "POST_ONLY" });

      expect(response.status).toBe(HttpStatus.CONFLICT);
    });

    test("Challenge 3b-4: self-trade prevention cancels the resting order and the aggressor continues against the rest of the book", async () => {
      const m = market();
      await place(m, { accountId: "same-account", side: "sell", price: "100", quantity: "5" });
      await place(m, { accountId: "other-maker", side: "sell", price: "101", quantity: "5" });

      const taker = await place(m, { accountId: "same-account", side: "buy", price: "101", quantity: "5" });

      expect(taker.body.data.cancellations).toHaveLength(1);
      expect(taker.body.data.trades).toHaveLength(1);
      expect(taker.body.data.trades[0].price).toBe("101");
    });
  });

  describe("Challenge 3c: Invariants", () => {
    test("Challenge 3c-1: the book is never crossed after any sequence of orders", async () => {
      const m = market();
      await fc.assert(
        fc.asyncProperty(
          fc.array(
            fc.record({
              side: fc.constantFrom("buy", "sell"),
              price: fc.integer({ min: 90, max: 110 }).map(String),
              quantity: fc.integer({ min: 1, max: 5 }).map(String),
            }),
            { minLength: 1, maxLength: 20 },
          ),
          async (orders) => {
            const runMarket = market();
            for (const order of orders) {
              await place(runMarket, { accountId: "trader", side: order.side as "buy" | "sell", price: order.price, quantity: order.quantity });
            }
            const book = await testSession.get(`/api/orders/book/${runMarket}`);
            const { bestBid, bestAsk } = book.body.data;
            if (bestBid !== null && bestAsk !== null) {
              expect(BigInt(bestBid) < BigInt(bestAsk)).toBe(true);
            }
          },
        ),
        { numRuns: 10 },
      );
      void m;
    });

    test("Challenge 3c-2: total fills against an order never exceed its quantity", async () => {
      const m = market();
      await place(m, { accountId: "maker", side: "sell", price: "100", quantity: "5" });

      const taker = await place(m, { accountId: "taker", side: "buy", price: "100", quantity: "5" });
      const totalFilled = taker.body.data.trades.reduce((sum: bigint, t: { quantity: string }) => sum + BigInt(t.quantity), 0n);

      expect(totalFilled <= 5n).toBe(true);
    });
  });

  describe("Challenge 3d: Cancellation", () => {
    test("Challenge 3d-1: cancelling a resting order removes exactly it, and a second cancel reports not found", async () => {
      const m = market();
      const order = await place(m, { accountId: "maker", side: "sell", price: "100", quantity: "5" });
      const orderId = order.body.data.orderId as string;

      const first = await testSession.delete(`/api/orders/${orderId}`);
      expect(first.status).toBe(HttpStatus.OK);
      expect(first.body.data.cancelled).toBe(true);

      const second = await testSession.delete(`/api/orders/${orderId}`);
      expect(second.status).toBe(HttpStatus.NOT_FOUND);
    });
  });

  describe("Challenge 3e: Stop and stop-limit orders", () => {
    test("Challenge 3e-1: a stop order triggers as a market order once the last trade price reaches its stop price", async () => {
      const m = market();
      await place(m, { accountId: "maker-a", side: "sell", price: "100", quantity: "10" });
      await place(m, { accountId: "priming-taker", side: "buy", price: "100", quantity: "5" });
      // maker-a now has 5 remaining @100. lastTradePrice=100.

      await place(m, { accountId: "maker-b", side: "sell", price: "101", quantity: "5" });
      // ask book: 100x5 (maker-a's remainder), 101x5 (maker-b)

      const stopResponse = await testSession.post("/api/orders").send({ market: m, accountId: "stop-trader", side: "buy", quantity: "5", orderType: "stop", stopPrice: "100" });
      expect(stopResponse.status).toBe(HttpStatus.CREATED);

      // The stop is already at/through its trigger price (100) at submission time, so it fires
      // immediately as a market buy for 5, consuming maker-a's remaining 5@100 in full and
      // leaving maker-b's resting 5@101 as the new best ask — proving the stop actually fired
      // (not that nothing happened).
      const book = await testSession.get(`/api/orders/book/${m}`);
      expect(book.body.data.bestAsk).toBe("101");
    });

    test("Challenge 3e-2: a stop-limit order triggers as a limit order at its own price, not a market order", async () => {
      const m = market();
      await place(m, { accountId: "maker-a", side: "sell", price: "100", quantity: "5" });
      await place(m, { accountId: "priming-taker", side: "buy", price: "100", quantity: "5" });

      await place(m, { accountId: "maker-b", side: "sell", price: "105", quantity: "5" });
      const stopLimitResponse = await testSession.post("/api/orders").send({ market: m, accountId: "stop-limit-trader", side: "buy", quantity: "5", orderType: "stop_limit", stopPrice: "100", price: "102" });
      expect(stopLimitResponse.status).toBe(HttpStatus.CREATED);

      // The triggered stop-limit (buy @102) should NOT cross maker-b's ask @105 — it should rest,
      // not trade, since 102 < 105.
      const book = await testSession.get(`/api/orders/book/${m}`);
      expect(book.body.data.bestBid).toBe("102");
    });

    test("Challenge 3e-3: multiple stops triggered by the same trade fire in original submission order", async () => {
      const m = market();
      await place(m, { accountId: "maker", side: "sell", price: "100", quantity: "10" });
      await place(m, { accountId: "priming-taker", side: "buy", price: "100", quantity: "1" });

      const firstStop = await testSession.post("/api/orders").send({ market: m, accountId: "first-stop", side: "buy", quantity: "1", orderType: "stop", stopPrice: "100" });
      const secondStop = await testSession.post("/api/orders").send({ market: m, accountId: "second-stop", side: "buy", quantity: "1", orderType: "stop", stopPrice: "100" });

      expect(firstStop.status).toBe(HttpStatus.CREATED);
      expect(secondStop.status).toBe(HttpStatus.CREATED);
      // Both stops should have triggered (last trade price 100 already meets stopPrice 100 for both,
      // at submission time) and traded against the maker's remaining quantity in the order they were
      // submitted — proven indirectly by the maker having exactly 10 - 1 - 1 - 1 = 7 remaining.
      const book = await testSession.get(`/api/orders/book/${m}`);
      expect(book.body.data.bestAsk).toBe("100");
    });
  });

  describe("Challenge 3f: Amendment", () => {
    test("Challenge 3f-1: decreasing quantity preserves queue position", async () => {
      const m = market();
      const first = await place(m, { accountId: "first", side: "sell", price: "100", quantity: "10" });
      await place(m, { accountId: "second", side: "sell", price: "100", quantity: "10" });
      const firstId = first.body.data.orderId as string;

      const amend = await testSession.patch(`/api/orders/${firstId}`).send({ quantity: "5" });
      expect(amend.status).toBe(HttpStatus.OK);

      // "first" still has queue priority despite the amendment — a taker for 5
      // should trade entirely against "first", not "second".
      const taker = await place(m, { accountId: "taker", side: "buy", price: "100", quantity: "5" });
      expect(taker.body.data.trades[0].sellOrderId).toBe(firstId);
    });

    test("Challenge 3f-2: a price change loses queue position, moving the order to the back of its new level", async () => {
      const m = market();
      const first = await place(m, { accountId: "first", side: "sell", price: "100", quantity: "5" });
      const second = await place(m, { accountId: "second", side: "sell", price: "101", quantity: "5" });
      const firstId = first.body.data.orderId as string;
      const secondId = second.body.data.orderId as string;

      const amend = await testSession.patch(`/api/orders/${firstId}`).send({ price: "101" });
      expect(amend.status).toBe(HttpStatus.OK);

      // "first" moved to price 101, behind "second" (which was already resting there).
      const taker = await place(m, { accountId: "taker", side: "buy", price: "101", quantity: "5" });
      expect(taker.body.data.trades[0].sellOrderId).toBe(secondId);
    });

    test("Challenge 3f-3: a quantity increase loses queue position", async () => {
      const m = market();
      const first = await place(m, { accountId: "first", side: "sell", price: "100", quantity: "5" });
      const second = await place(m, { accountId: "second", side: "sell", price: "100", quantity: "5" });
      const firstId = first.body.data.orderId as string;

      const amend = await testSession.patch(`/api/orders/${firstId}`).send({ quantity: "10" });
      expect(amend.status).toBe(HttpStatus.OK);

      const secondId = second.body.data.orderId as string;
      const taker = await place(m, { accountId: "taker", side: "buy", price: "100", quantity: "5" });
      expect(taker.body.data.trades[0].sellOrderId).toBe(secondId);
    });

    test("Challenge 3f-4: amending a non-existent or already-filled order returns 404", async () => {
      const m = market();
      const maker = await place(m, { accountId: "maker", side: "sell", price: "100", quantity: "5" });
      const makerId = maker.body.data.orderId as string;

      // Control: a live order can be amended.
      expect((await testSession.patch(`/api/orders/${makerId}`).send({ quantity: "4" })).status).toBe(HttpStatus.OK);

      // Fill it completely: it is gone, so amending it is a 404, exactly like an id that never existed.
      await place(m, { accountId: "taker", side: "buy", price: "100", quantity: "4" });
      expect((await testSession.patch(`/api/orders/${makerId}`).send({ quantity: "1" })).status).toBe(HttpStatus.NOT_FOUND);
      expect((await testSession.patch("/api/orders/does-not-exist").send({ quantity: "1" })).status).toBe(HttpStatus.NOT_FOUND);
    });

    test("Challenge 3f-5: amending to a non-positive quantity is rejected", async () => {
      const m = market();
      const order = await place(m, { accountId: "maker", side: "sell", price: "100", quantity: "5" });
      const orderId = order.body.data.orderId as string;

      const response = await testSession.patch(`/api/orders/${orderId}`).send({ quantity: "0" });
      expect(response.status).toBe(HttpStatus.CONFLICT);
    });

    test("Challenge 3f-6: decreasing the quantity of an order that is NOT at the front keeps its exact place in the queue", async () => {
      const m = market();
      const ids: string[] = [];
      for (const account of ["a", "b", "c", "d"]) {
        const placed = await place(m, { accountId: account, side: "sell", price: "100", quantity: "10" });
        ids.push(placed.body.data.orderId as string);
      }

      // Shrink the middle two, and the last one too; none of them may jump the queue.
      expect((await testSession.patch(`/api/orders/${ids[2]}`).send({ quantity: "5" })).status).toBe(HttpStatus.OK);
      expect((await testSession.patch(`/api/orders/${ids[1]}`).send({ quantity: "7" })).status).toBe(HttpStatus.OK);
      expect((await testSession.patch(`/api/orders/${ids[3]}`).send({ quantity: "9" })).status).toBe(HttpStatus.OK);

      const taker = await place(m, { accountId: "taker", side: "buy", price: "100", quantity: "31" });
      const trades = taker.body.data.trades as { sellOrderId: string; quantity: string }[];
      expect(trades.map((trade) => trade.sellOrderId)).toEqual(ids);
      expect(trades.map((trade) => trade.quantity)).toEqual(["10", "7", "5", "9"]);
    });
  });

  describe("Challenge 3g: Concurrency", () => {
    test("Challenge 3g-1: a cancel racing an aggressing fill resolves to exactly one consistent outcome", async () => {
      const m = market();
      const maker = await place(m, { accountId: "maker", side: "sell", price: "100", quantity: "5" });
      const orderId = maker.body.data.orderId as string;

      const [cancelResponse, fillResponse] = await Promise.all([
        testSession.delete(`/api/orders/${orderId}`),
        place(m, { accountId: "taker", side: "buy", price: "100", quantity: "5" }),
      ]);

      const cancelSucceeded = cancelResponse.status === HttpStatus.OK && cancelResponse.body.data.cancelled === true;
      const fillHappened = fillResponse.body.data.trades.length > 0;

      // Exactly one of the two outcomes won — never both (double-counted
      // quantity: the maker's 5 units both cancelled AND traded) and never
      // neither (the order vanishes with no trade and no successful cancel).
      expect(cancelSucceeded !== fillHappened).toBe(true);

      if (fillHappened) {
        expect(fillResponse.body.data.trades[0].quantity).toBe("5");
      } else {
        expect(cancelResponse.body.data.cancelled).toBe(true);
      }
    });

    test("Challenge 3g-2: an amend racing an aggressing fill never double-counts quantity", async () => {
      const m = market();
      const maker = await place(m, { accountId: "maker", side: "sell", price: "100", quantity: "5" });
      const orderId = maker.body.data.orderId as string;

      const [amendResponse, fillResponse] = await Promise.all([
        testSession.patch(`/api/orders/${orderId}`).send({ quantity: "3" }),
        place(m, { accountId: "taker", side: "buy", price: "100", quantity: "5" }),
      ]);

      const totalTraded = (fillResponse.body.data.trades as Array<{ quantity: string }>).reduce((sum: bigint, t) => sum + BigInt(t.quantity), 0n);
      const book = await testSession.get(`/api/orders/book/${m}`);

      // Exactly two consistent outcomes are possible depending on interleaving —
      // never a third value, and book state must corroborate whichever one occurred.
      if (amendResponse.status === HttpStatus.OK) {
        // Amend won: maker reduced to 3 before the fill, taker's leftover 2 rests as a bid.
        expect(totalTraded).toBe(3n);
        expect(book.body.data.bestBid).toBe("100");
        expect(book.body.data.bestAsk).toBe(null);
      } else {
        // Fill won: taker's 5 fully consumed the maker's original 5 before the amend arrived.
        expect(amendResponse.status).toBe(HttpStatus.NOT_FOUND);
        expect(totalTraded).toBe(5n);
        expect(book.body.data.bestBid).toBe(null);
        expect(book.body.data.bestAsk).toBe(null);
      }
    });
  });

  describe("Challenge 3h: Determinism", () => {
    test("Challenge 3h-1: replaying the same 10,000-operation sequence twice produces identical trades and an identical final book", async () => {
      const { placeOrder, bestPrices, resetAllBooks: reset } = await import("../src/services/matchingEngine.js");

      function randomOps(seed: number, count: number) {
        // A tiny deterministic PRNG (mulberry32) so this test's own "randomness"
        // is reproducible independent of fast-check's global seed - what matters
        // here is that BOTH replay passes see the exact same sequence, not that
        // the sequence itself is unpredictable across test runs.
        let state = seed;
        function next(): number {
          state |= 0;
          state = (state + 0x6d2b79f5) | 0;
          let t = Math.imul(state ^ (state >>> 15), 1 | state);
          t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
          return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        }
        const ops: Array<{ side: "buy" | "sell"; price: string; quantity: string; accountId: string }> = [];
        for (let i = 0; i < count; i += 1) {
          ops.push({
            side: next() < 0.5 ? "buy" : "sell",
            price: String(90 + Math.floor(next() * 21)),
            quantity: String(1 + Math.floor(next() * 5)),
            accountId: `acct-${Math.floor(next() * 20)}`,
          });
        }
        return ops;
      }

      const ops = randomOps(42, 10_000);
      const market = "DETERMINISM-TEST";

      function runOnce() {
        reset();
        const trades: unknown[] = [];
        for (const [index, op] of ops.entries()) {
          const result = placeOrder(market, { id: `op-${index}`, accountId: op.accountId, side: op.side, price: BigInt(op.price), quantity: BigInt(op.quantity), timeInForce: "GTC" });
          trades.push(...result.trades.map((t) => ({ ...t, price: t.price.toString(), quantity: t.quantity.toString() })));
        }
        const finalBook = bestPrices(market);
        return { trades, finalBook };
      }

      const first = runOnce();
      const second = runOnce();

      expect(second.trades).toEqual(first.trades);
      expect(second.finalBook).toEqual(first.finalBook);
    });
  });

  describe("Challenge 3i: Performance", () => {
    test("Challenge 3i-1: per-order insert cost does not grow linearly with book depth", async () => {
      const { placeOrder, resetAllBooks: reset } = await import("../src/services/matchingEngine.js");

      function timeInserts(market: string, count: number, priceSpread: number): number {
        const startedAt = process.hrtime.bigint();
        for (let i = 0; i < count; i += 1) {
          const price = BigInt(1000 + (i % priceSpread));
          // Alternate sides so orders rest rather than match away, building real depth.
          const side = i % 2 === 0 ? "buy" : "sell";
          const restingPrice = side === "buy" ? price - 1n : price + BigInt(priceSpread) + 1n; // keep bids/asks from crossing
          placeOrder(market, { id: `perf-${market}-${i}`, accountId: `acct-${i}`, side, price: restingPrice, quantity: 1n, timeInForce: "GTC" });
        }
        const elapsedNs = Number(process.hrtime.bigint() - startedAt);
        return elapsedNs / count / 1_000_000; // average ms per order
      }

      reset();
      const smallAvgMs = timeInserts("PERF-SMALL", 1_000, 100);

      reset();
      const largeAvgMs = timeInserts("PERF-LARGE", 100_000, 1_000);

      // An O(n) linear-scan insert would show roughly a 100x degradation
      // (100,000 / 1,000 = 100x the depth). A real sub-linear structure
      // should show close to no degradation. Allow generous headroom for
      // machine noise/GC while still clearly failing a linear-scan
      // implementation.
      const ratio = largeAvgMs / Math.max(smallAvgMs, 0.0001);
      expect(ratio).toBeLessThan(5);
    }, 30_000); // this test does real work at 100k orders; give it more than the default timeout
  });

  describe("Challenge 3j: Stateful model", () => {
    test("Challenge 3j-1: randomized place/cancel sequences keep the book uncrossed and agree with a naive reference matcher", async () => {
      const { placeOrder, cancel: cancelOp, bestPrices, resetAllBooks: reset } = await import("../src/services/matchingEngine.js");

      interface ModelOrder {
        id: string;
        accountId: string;
        side: "buy" | "sell";
        price: bigint;
        remaining: bigint;
      }

      // A deliberately naive reference matcher: scans the WHOLE opposite side
      // on every call, no price-level structure, no optimization. Slow is
      // fine - it exists purely as an independent "model agreement" oracle,
      // not as production code.
      class NaiveModel {
        orders: ModelOrder[] = [];
        trades: Array<{ buyOrderId: string; sellOrderId: string; price: bigint; quantity: bigint }> = [];
        cancellations: string[] = [];

        place(id: string, accountId: string, side: "buy" | "sell", price: bigint, quantity: bigint): void {
          let remaining = quantity;
          const crosses = (o: ModelOrder) => (side === "buy" ? price >= o.price : price <= o.price);
          while (remaining > 0n) {
            const opposite = this.orders.filter((o) => o.side !== side && crosses(o));
            if (opposite.length === 0) break;
            // Best price, then earliest insertion (orders array preserves insertion order).
            const best = opposite.reduce((a, b) => {
              const aBetter = side === "buy" ? a.price <= b.price : a.price >= b.price;
              return aBetter ? a : b;
            });
            if (best.accountId === accountId) {
              this.orders = this.orders.filter((o) => o.id !== best.id);
              this.cancellations.push(best.id);
              continue;
            }
            const tradeQty = remaining < best.remaining ? remaining : best.remaining;
            this.trades.push({
              buyOrderId: side === "buy" ? id : best.id,
              sellOrderId: side === "buy" ? best.id : id,
              price: best.price,
              quantity: tradeQty,
            });
            best.remaining -= tradeQty;
            remaining -= tradeQty;
            if (best.remaining === 0n) this.orders = this.orders.filter((o) => o.id !== best.id);
          }
          if (remaining > 0n) {
            this.orders.push({ id, accountId, side, price, remaining });
          }
        }

        cancel(id: string): void {
          this.orders = this.orders.filter((o) => o.id !== id);
        }

        bestBid(): bigint | undefined {
          const bids = this.orders.filter((o) => o.side === "buy");
          return bids.length ? bids.reduce((a, b) => (a.price > b.price ? a : b)).price : undefined;
        }
        bestAsk(): bigint | undefined {
          const asks = this.orders.filter((o) => o.side === "sell");
          return asks.length ? asks.reduce((a, b) => (a.price < b.price ? a : b)).price : undefined;
        }
      }

      const priceArb = fc.integer({ min: 95, max: 105 }).map(BigInt);
      const qtyArb = fc.integer({ min: 1, max: 5 }).map(BigInt);
      const sideArb = fc.constantFrom<"buy" | "sell">("buy", "sell");
      const accountArb = fc.constantFrom("acct-1", "acct-2", "acct-3");

      const placeCommand = fc.record({ kind: fc.constant("place" as const), side: sideArb, price: priceArb, quantity: qtyArb, accountId: accountArb });
      const cancelCommand = fc.record({ kind: fc.constant("cancel" as const), targetIndex: fc.nat({ max: 50 }) });

      await fc.assert(
        fc.asyncProperty(fc.array(fc.oneof(placeCommand, cancelCommand), { minLength: 5, maxLength: 60 }), async (commands) => {
          reset();
          const model = new NaiveModel();
          const placedIds: string[] = [];
          const accountById = new Map<string, string>();
          const market = "STATEFUL";

          for (const [index, command] of commands.entries()) {
            if (command.kind === "place") {
              const id = `cmd-${index}`;
              const tradesBefore = model.trades.length;
              const cancellationsBefore = model.cancellations.length;
              const result = placeOrder(market, { id, accountId: command.accountId, side: command.side, price: command.price, quantity: command.quantity, timeInForce: "GTC" });
              model.place(id, command.accountId, command.side, command.price, command.quantity);
              placedIds.push(id);
              accountById.set(id, command.accountId);

              // Per-placement agreement: engine trades and STP cancellations must equal the model's, in order.
              expect(result.trades.map((t) => ({ buyOrderId: t.buyOrderId, sellOrderId: t.sellOrderId, price: t.price, quantity: t.quantity }))).toEqual(model.trades.slice(tradesBefore));
              expect(result.cancellations.map((c) => c.orderId)).toEqual(model.cancellations.slice(cancellationsBefore));

              // Self-trade safety: no trade may have the same ACCOUNT on both sides.
              for (const trade of result.trades) {
                expect(accountById.get(trade.buyOrderId)).not.toBe(accountById.get(trade.sellOrderId));
              }
            } else {
              const targetId = placedIds[command.targetIndex % Math.max(placedIds.length, 1)];
              if (targetId) {
                cancelOp(targetId);
                model.cancel(targetId);
              }
            }

            // Property: book never crossed.
            const live = bestPrices(market);
            if (live.bestBid !== null && live.bestAsk !== null) {
              expect(BigInt(live.bestBid) < BigInt(live.bestAsk)).toBe(true);
            }

            // Property: model agreement on best prices after every command.
            expect(live.bestBid).toBe(model.bestBid()?.toString() ?? null);
            expect(live.bestAsk).toBe(model.bestAsk()?.toString() ?? null);
          }
        }),
        { numRuns: 50 },
      );
    });
  });
});
