import fc from "fast-check";
import { expect, test, describe } from "vitest";
import { StrategyEngine, type Action, type ChildOrder, type Side } from "../src/domain/strategyOrders.js";

const opposite = (side: Side): Side => (side === "buy" ? "sell" : "buy");
// An exit on `side` is reached when a sell exit's price falls to the stop, or a buy exit's price rises to it.
const reached = (exitSide: Side, price: bigint, stop: bigint): boolean => (exitSide === "sell" ? price <= stop : price >= stop);

const json = (value: unknown): string => JSON.stringify(value, (_k, v) => (typeof v === "bigint" ? v.toString() : v));

function child(parentId: string, role: string, side: Side, kind: "limit" | "market", quantity: bigint, sequence: number, price?: bigint): Action {
  const order: ChildOrder = { orderId: `${parentId}:${role}`, parentId, role, side, kind, quantity, sequence };
  if (price !== undefined) order.price = price;
  return { type: "place", order };
}
const cancelOf = (parentId: string, role: string): Action => ({ type: "cancel", orderId: `${parentId}:${role}`, parentId });

let fillCounter = 0;
const nextFill = (orderId: string, quantity: bigint) => ({ orderId, fillId: `fill-${(fillCounter += 1)}`, quantity });

const sideArb = fc.constantFrom<Side>("sell", "buy");
const eventArb = fc.record({ kind: fc.constantFrom("tick", "fill", "fill", "stale"), a: fc.nat(1000), b: fc.nat(1000) });
const tickPrice = (a: number): bigint => 900n + BigInt(a % 201); // 900 .. 1100

describe("Challenge 15: Complex Order Types", () => {
  describe("Challenge 15a: OCO (one cancels the other)", () => {
    test("Challenge 15a-1: a triggered stop cancels the limit and sells exactly what is still unfilled, for any fill and price history", () => {
      fc.assert(
        fc.property(sideArb, fc.integer({ min: 5, max: 100 }), fc.integer({ min: 1, max: 50 }), fc.integer({ min: 1, max: 50 }), fc.array(eventArb, { minLength: 1, maxLength: 30 }), (side, qty, limitGap, stopGap, events) => {
          const quantity = BigInt(qty);
          const limitPrice = side === "sell" ? 1000n + BigInt(limitGap) : 1000n - BigInt(limitGap);
          const stopPrice = side === "sell" ? 1000n - BigInt(stopGap) : 1000n + BigInt(stopGap);
          const engine = new StrategyEngine();
          expect(engine.submit({ kind: "oco", id: "oco", accountId: "a", side, quantity, limitPrice, stopPrice, sequence: 7 })).toEqual([child("oco", "limit", side, "limit", quantity, 7, limitPrice)]);

          let limitFilled = 0n;
          let fired = false;
          for (const event of events) {
            if (event.kind === "tick") {
              const price = tickPrice(event.a);
              const actions = engine.onMarketPrice(price);
              if (!fired && limitFilled < quantity && reached(side, price, stopPrice)) {
                fired = true;
                expect(actions).toEqual([cancelOf("oco", "limit"), child("oco", "stop", side, "market", quantity - limitFilled, 7)]);
              } else {
                expect(actions).toEqual([]);
              }
            } else {
              // A fill on the limit: real while it is live, ignored once cancelled or complete.
              const remaining = quantity - limitFilled;
              const size = remaining === 0n || fired ? 1n : BigInt(1 + (event.b % Number(remaining)));
              expect(engine.onFill(nextFill("oco:limit", size))).toEqual([]);
              if (!fired && remaining > 0n) limitFilled += size;
            }
          }
          if (fired) expect(limitFilled).toBeLessThan(quantity);
        }),
      );
    });

    test("Challenge 15a-2: a partially filled take-profit leaves a smaller stop, and the stop fires only once", () => {
      const engine = new StrategyEngine();
      engine.submit({ kind: "oco", id: "p", accountId: "a", side: "sell", quantity: 10n, limitPrice: 110n, stopPrice: 95n, sequence: 3 });
      expect(engine.onMarketPrice(100n)).toEqual([]);
      expect(engine.onFill(nextFill("p:limit", 4n))).toEqual([]);
      expect(engine.onMarketPrice(95n)).toEqual([cancelOf("p", "limit"), child("p", "stop", "sell", "market", 6n, 3)]);
      expect(engine.onMarketPrice(80n)).toEqual([]);
    });
  });

  describe("Challenge 15b: Bracket orders", () => {
    test("Challenge 15b-1: exits always cover exactly the cumulative entry fill, and a stop-loss also cancels the unfilled entry", () => {
      fc.assert(
        fc.property(sideArb, fc.integer({ min: 5, max: 100 }), fc.array(eventArb, { minLength: 1, maxLength: 30 }), (entrySide, qty, events) => {
          const quantity = BigInt(qty);
          const exit = opposite(entrySide);
          const entryPrice = 1000n;
          const takeProfit = entrySide === "buy" ? 1030n : 970n;
          const stopLoss = entrySide === "buy" ? 970n : 1030n;
          const engine = new StrategyEngine();
          expect(engine.submit({ kind: "bracket", id: "b", accountId: "a", side: entrySide, quantity, entryPrice, takeProfitPrice: takeProfit, stopLossPrice: stopLoss, sequence: 5 })).toEqual([
            child("b", "entry", entrySide, "limit", quantity, 5, entryPrice),
          ]);

          let entryFilled = 0n;
          let entryLive = true;
          const pairs: { k: number; quantity: bigint; tpFilled: bigint; armed: boolean }[] = [];
          for (const event of events) {
            if (event.kind === "fill") {
              const remaining = quantity - entryFilled;
              if (!entryLive || remaining === 0n) continue;
              const size = BigInt(1 + (event.b % Number(remaining)));
              const k = pairs.length + 1;
              expect(engine.onFill(nextFill("b:entry", size))).toEqual([child("b", `take_profit:${k}`, exit, "limit", size, 5, takeProfit)]);
              entryFilled += size;
              pairs.push({ k, quantity: size, tpFilled: 0n, armed: true });
              if (entryFilled === quantity) entryLive = false;
            } else if (event.kind === "stale") {
              // Fill part of an armed pair's take-profit.
              const open = pairs.filter((p) => p.armed && p.tpFilled < p.quantity);
              if (open.length === 0) continue;
              const pair = open[event.a % open.length]!;
              const size = BigInt(1 + (event.b % Number(pair.quantity - pair.tpFilled)));
              expect(engine.onFill(nextFill(`b:take_profit:${pair.k}`, size))).toEqual([]);
              pair.tpFilled += size;
              if (pair.tpFilled === pair.quantity) pair.armed = false;
            } else {
              const price = tickPrice(event.a);
              const expected: Action[] = [];
              let fired = false;
              for (const pair of pairs) {
                if (!pair.armed || !reached(exit, price, stopLoss)) continue;
                pair.armed = false;
                fired = true;
                expected.push(cancelOf("b", `take_profit:${pair.k}`), child("b", `stop_loss:${pair.k}`, exit, "market", pair.quantity - pair.tpFilled, 5));
              }
              if (fired && entryLive) {
                expected.push(cancelOf("b", "entry"));
                entryLive = false;
              }
              expect(engine.onMarketPrice(price)).toEqual(expected);
            }
            // Invariant: every take-profit placed so far covers exactly what the entry has filled.
            expect(pairs.reduce((sum, p) => sum + p.quantity, 0n)).toBe(entryFilled);
          }
        }),
      );
    });
  });

  describe("Challenge 15c: Iceberg orders", () => {
    test("Challenge 15c-1: only one clip is live, clips replenish only when fully filled, never exceed the total, and keep the original sequence", () => {
      fc.assert(
        fc.property(sideArb, fc.integer({ min: 1, max: 200 }), fc.integer({ min: 1, max: 60 }), fc.integer({ min: 0, max: 1_000_000 }), fc.array(fc.nat(1000), { minLength: 1, maxLength: 60 }), (side, totalRaw, clipRaw, seq, rolls) => {
          const total = BigInt(totalRaw);
          const clip = BigInt(Math.min(clipRaw, totalRaw));
          const engine = new StrategyEngine();
          const first = engine.submit({ kind: "iceberg", id: "ice", accountId: "a", side, price: 500n, quantity: total, clipQuantity: clip, sequence: seq });
          const min = (a: bigint, b: bigint) => (a < b ? a : b);
          expect(first).toEqual([child("ice", "clip:1", side, "limit", min(clip, total), seq, 500n)]);

          let n = 1;
          let placed = min(clip, total);
          let clipFilled = 0n;
          let clipSize = placed;
          let filledTotal = 0n;
          for (const roll of rolls) {
            if (filledTotal === total) {
              // Finished: a stale fill of the last clip is ignored and nothing new appears.
              expect(engine.onFill(nextFill(`ice:clip:${n}`, 1n))).toEqual([]);
              continue;
            }
            const remainingInClip = clipSize - clipFilled;
            const size = BigInt(1 + (roll % Number(remainingInClip)));
            const actions = engine.onFill(nextFill(`ice:clip:${n}`, size));
            clipFilled += size;
            filledTotal += size;
            if (clipFilled === clipSize && placed < total) {
              n += 1;
              clipSize = min(clip, total - placed);
              placed += clipSize;
              clipFilled = 0n;
              expect(actions).toEqual([child("ice", `clip:${n}`, side, "limit", clipSize, seq, 500n)]);
              expect(clipSize).toBeLessThanOrEqual(clip);
            } else {
              expect(actions).toEqual([]);
            }
            expect(placed).toBeLessThanOrEqual(total);
          }
        }),
      );
    });
  });

  describe("Challenge 15d: Trailing stops", () => {
    test("Challenge 15d-1: the stop only ever ratchets in the favourable direction and fires exactly once, matching an independent oracle", () => {
      fc.assert(
        fc.property(sideArb, fc.integer({ min: 1, max: 100 }), fc.array(fc.integer({ min: -30, max: 30 }), { minLength: 1, maxLength: 60 }), (side, offsetRaw, steps) => {
          const offset = BigInt(offsetRaw);
          const engine = new StrategyEngine();
          expect(engine.submit({ kind: "trailing_stop", id: "t", accountId: "a", side, quantity: 9n, offset, referencePrice: 1000n, sequence: 4 })).toEqual([]);

          let price = 1000n;
          let mark = 1000n;
          let done = false;
          let lastStop: bigint | undefined = side === "sell" ? mark - offset : mark + offset;
          expect(engine.stopLevel("t")).toBe(lastStop);
          for (const step of steps) {
            price += BigInt(step);
            if (price < 1n) price = 1n;
            const actions = engine.onMarketPrice(price);
            if (done) {
              expect(actions).toEqual([]);
              expect(engine.stopLevel("t")).toBeUndefined();
              continue;
            }
            if (side === "sell" ? price > mark : price < mark) mark = price;
            const stop = side === "sell" ? mark - offset : mark + offset;
            if (reached(side, price, stop)) {
              done = true;
              expect(actions).toEqual([child("t", "trigger", side, "market", 9n, 4)]);
              expect(engine.stopLevel("t")).toBeUndefined();
            } else {
              expect(actions).toEqual([]);
              expect(engine.stopLevel("t")).toBe(stop);
              if (lastStop !== undefined) {
                if (side === "sell") expect(stop >= lastStop).toBe(true);
                else expect(stop <= lastStop).toBe(true);
              }
              lastStop = stop;
            }
          }
        }),
      );
    });
  });

  describe("Challenge 15e: Redelivery, determinism and cancellation", () => {
    test("Challenge 15e-1: a redelivered fill changes nothing, and the same event history always yields the same actions", () => {
      fc.assert(
        fc.property(fc.array(fc.tuple(fc.constantFrom("tick", "fill"), fc.nat(1000), fc.nat(1000)), { minLength: 1, maxLength: 40 }), (script) => {
          const run = (redeliver: boolean): string => {
            const engine = new StrategyEngine();
            const out: Action[][] = [];
            out.push(engine.submit({ kind: "iceberg", id: "i", accountId: "a", side: "buy", price: 500n, quantity: 40n, clipQuantity: 7n, sequence: 1 }));
            out.push(engine.submit({ kind: "oco", id: "o", accountId: "a", side: "sell", quantity: 20n, limitPrice: 1010n, stopPrice: 990n, sequence: 2 }));
            out.push(engine.submit({ kind: "bracket", id: "b", accountId: "a", side: "buy", quantity: 12n, entryPrice: 1000n, takeProfitPrice: 1020n, stopLossPrice: 980n, sequence: 3 }));
            const live = new Map<string, bigint>([["i:clip:1", 7n], ["o:limit", 20n], ["b:entry", 12n]]);
            let serial = 0;
            for (const [kind, a, b] of script) {
              if (kind === "tick") {
                out.push(engine.onMarketPrice(tickPrice(a)));
                continue;
              }
              const ids = [...live.keys()];
              if (ids.length === 0) continue;
              const orderId = ids[a % ids.length]!;
              const remaining = live.get(orderId)!;
              const size = BigInt(1 + (b % Number(remaining)));
              serial += 1;
              const fill = { orderId, fillId: `det-${serial}`, quantity: size };
              const actions = engine.onFill(fill);
              out.push(actions);
              live.set(orderId, remaining - size);
              if (remaining - size === 0n) live.delete(orderId);
              for (const action of actions) if (action.type === "place" && action.order.kind === "limit") live.set(action.order.orderId, action.order.quantity);
              for (const action of actions) if (action.type === "cancel") live.delete(action.orderId);
              if (redeliver) {
                expect(engine.onFill(fill)).toEqual([]);
                expect(engine.onFill(fill)).toEqual([]);
              }
            }
            return json(out);
          };
          const once = run(false);
          expect(run(false)).toBe(once);
          expect(run(true)).toBe(once);
        }),
      );
    });

    test("Challenge 15e-2: cancelling a parent cancels its live limit children, disarms its stops, stops replenishing, and is idempotent", () => {
      const engine = new StrategyEngine();
      engine.submit({ kind: "iceberg", id: "i", accountId: "a", side: "sell", price: 50n, quantity: 30n, clipQuantity: 10n, sequence: 1 });
      expect(engine.cancel("i")).toEqual([cancelOf("i", "clip:1")]);
      expect(engine.cancel("i")).toEqual([]);
      expect(engine.onFill(nextFill("i:clip:1", 5n))).toEqual([]);

      engine.submit({ kind: "oco", id: "o", accountId: "a", side: "sell", quantity: 10n, limitPrice: 110n, stopPrice: 90n, sequence: 2 });
      expect(engine.cancel("o")).toEqual([cancelOf("o", "limit")]);
      expect(engine.onMarketPrice(50n)).toEqual([]);

      engine.submit({ kind: "bracket", id: "b", accountId: "a", side: "buy", quantity: 10n, entryPrice: 100n, takeProfitPrice: 120n, stopLossPrice: 80n, sequence: 3 });
      engine.onFill(nextFill("b:entry", 4n));
      expect(engine.cancel("b")).toEqual([cancelOf("b", "entry"), cancelOf("b", "take_profit:1")]);
      expect(engine.onMarketPrice(10n)).toEqual([]);

      engine.submit({ kind: "trailing_stop", id: "t", accountId: "a", side: "sell", quantity: 5n, offset: 10n, referencePrice: 100n, sequence: 4 });
      expect(engine.cancel("t")).toEqual([]);
      expect(engine.onMarketPrice(1n)).toEqual([]);
      expect(() => engine.cancel("nope")).toThrow(RangeError);
    });
  });

  describe("Challenge 15f: Input validation", () => {
    test("Challenge 15f-1: impossible orders and impossible fills throw RangeError", () => {
      const engine = new StrategyEngine();
      const base = { accountId: "a", sequence: 1 };
      expect(() => engine.submit({ kind: "oco", id: "x1", side: "sell", quantity: 5n, limitPrice: 90n, stopPrice: 100n, ...base })).toThrow(RangeError);
      expect(() => engine.submit({ kind: "oco", id: "x2", side: "buy", quantity: 5n, limitPrice: 110n, stopPrice: 100n, ...base })).toThrow(RangeError);
      expect(() => engine.submit({ kind: "bracket", id: "x3", side: "buy", quantity: 5n, entryPrice: 100n, takeProfitPrice: 90n, stopLossPrice: 80n, ...base })).toThrow(RangeError);
      expect(() => engine.submit({ kind: "bracket", id: "x4", side: "sell", quantity: 5n, entryPrice: 100n, takeProfitPrice: 90n, stopLossPrice: 95n, ...base })).toThrow(RangeError);
      expect(() => engine.submit({ kind: "iceberg", id: "x5", side: "buy", price: 10n, quantity: 5n, clipQuantity: 6n, ...base })).toThrow(RangeError);
      expect(() => engine.submit({ kind: "iceberg", id: "x6", side: "buy", price: 10n, quantity: 5n, clipQuantity: 0n, ...base })).toThrow(RangeError);
      expect(() => engine.submit({ kind: "trailing_stop", id: "x7", side: "sell", quantity: 5n, offset: 0n, referencePrice: 100n, ...base })).toThrow(RangeError);
      expect(() => engine.submit({ kind: "iceberg", id: "x8", side: "buy", price: 10n, quantity: 0n, clipQuantity: 1n, ...base })).toThrow(RangeError);

      engine.submit({ kind: "iceberg", id: "ok", side: "buy", price: 10n, quantity: 5n, clipQuantity: 2n, ...base });
      expect(() => engine.submit({ kind: "iceberg", id: "ok", side: "buy", price: 10n, quantity: 5n, clipQuantity: 2n, ...base })).toThrow(RangeError);
      expect(() => engine.onFill(nextFill("ghost:clip:1", 1n))).toThrow(RangeError);
      expect(() => engine.onFill(nextFill("ok:clip:1", 0n))).toThrow(RangeError);
      expect(() => engine.onFill(nextFill("ok:clip:1", 3n))).toThrow(RangeError);
    });
  });
});
