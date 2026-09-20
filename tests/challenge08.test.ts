import fc from "fast-check";
import type { Agent } from "supertest";
import app from "../src/server.js";
import db from "../db/db-config.js";
import testBase from "./testBase.js";
import { expect, test, describe, beforeAll, afterAll } from "vitest";
import HttpStatus from "../src/enums/httpStatus.js";
import { aggregateCandles, rollUp, fillGaps, vwap, bucketStart, type Trade } from "../src/domain/marketData.js";

let testSession: Agent;

beforeAll(async () => {
  testSession = testBase.createSuperTestSession(app);
  await testBase.resetDatabase(db);
});
afterAll(async () => {
  await new Promise<void>((resolve, reject) => {
    app.close((err) => (err ? reject(err) : resolve()));
  });
});

const ONE_MINUTE = 60_000;
const ONE_HOUR = 60 * ONE_MINUTE;

function trade(sequence: number, price: number, quantity: number, timestampMs: number): Trade {
  return { sequence, price: BigInt(price), quantity: BigInt(quantity), timestampMs };
}

describe("Challenge 08: Market Data, Calendars and Time", () => {
  describe("Challenge 8a: OHLCV correctness", () => {
    test("Challenge 8a-1: open and close are taken by arrival sequence, not by timestamp collision order", async () => {
      const trades = [trade(3, 90, 1, 5000), trade(1, 100, 1, 5000), trade(2, 105, 1, 5000)];
      const candles = aggregateCandles(trades, ONE_MINUTE);

      expect(candles).toHaveLength(1);
      expect(candles[0]?.open).toBe(100n);
      expect(candles[0]?.close).toBe(90n);
      expect(candles[0]?.high).toBe(105n);
      expect(candles[0]?.low).toBe(90n);
      expect(candles[0]?.volume).toBe(3n);
    });

    test("Challenge 8a-2: property — high is always the maximum trade price and low the minimum, for any trade set in one bucket", () => {
      fc.assert(
        fc.property(fc.array(fc.tuple(fc.integer({ min: 1, max: 100 }), fc.integer({ min: 1, max: 10000 })), { minLength: 1, maxLength: 30 }), (priceQty) => {
          const trades = priceQty.map(([price, qty], i) => trade(i + 1, price, qty, 1000));
          const candles = aggregateCandles(trades, ONE_MINUTE);
          const prices = priceQty.map(([p]) => p);

          expect(candles[0]?.high).toBe(BigInt(Math.max(...prices)));
          expect(candles[0]?.low).toBe(BigInt(Math.min(...prices)));
        }),
      );
    });

    test("Challenge 8a-3: property — on randomised trades spanning many buckets, candles at 1m, 5m, 1h and 1d match an independent oracle", () => {
      const ONE_DAY = 24 * ONE_HOUR;
      const resolutions = [ONE_MINUTE, 5 * ONE_MINUTE, ONE_HOUR, ONE_DAY];

      const rawTrade = fc.record({
        price: fc.integer({ min: 1, max: 1000 }),
        quantity: fc.integer({ min: 1, max: 1000 }),
        timestampMs: fc.oneof(fc.integer({ min: 0, max: 3 * ONE_DAY }), fc.integer({ min: 0, max: 2 * ONE_HOUR })),
        sequenceKey: fc.integer({ min: 0, max: 1_000_000 }),
      });

      fc.assert(
        fc.property(fc.array(rawTrade, { minLength: 1, maxLength: 40 }), (raws) => {
          const ranked = raws.map((raw, index) => ({ raw, index })).sort((a, b) => a.raw.sequenceKey - b.raw.sequenceKey || a.index - b.index);
          const sequenceByIndex = new Map(ranked.map((entry, rank) => [entry.index, rank + 1]));
          const trades = raws.map((raw, index) => trade(sequenceByIndex.get(index)!, raw.price, raw.quantity, raw.timestampMs));

          for (const resolution of resolutions) {
            const byBucket = new Map<number, Trade[]>();
            for (const t of trades) {
              const start = Math.floor(t.timestampMs / resolution) * resolution;
              expect(bucketStart(t.timestampMs, resolution)).toBe(start);
              byBucket.set(start, [...(byBucket.get(start) ?? []), t]);
            }

            const oracle = [...byBucket.entries()]
              .sort(([a], [b]) => a - b)
              .map(([bucketStartMs, bucket]) => {
                const bySequence = [...bucket].sort((a, b) => a.sequence - b.sequence);
                const prices = bucket.map((t) => t.price);
                return {
                  bucketStartMs,
                  open: bySequence[0]!.price,
                  high: prices.reduce((m, p) => (p > m ? p : m)),
                  low: prices.reduce((m, p) => (p < m ? p : m)),
                  close: bySequence[bySequence.length - 1]!.price,
                  volume: bucket.reduce((sum, t) => sum + t.quantity, 0n),
                  tradeCount: bucket.length,
                };
              });

            const candles = aggregateCandles(trades, resolution);
            expect(candles).toHaveLength(oracle.length);
            candles.forEach((candle, i) => expect(candle).toMatchObject(oracle[i]!));
          }
        }),
      );
    });
  });

  describe("Challenge 8b: Hierarchical consistency", () => {
    test("Challenge 8b-1: rolling up every 1-minute candle in an hour reproduces the 1-hour candle's volume, high and low", () => {
      const trades: Trade[] = [];
      let seq = 1;
      for (let minute = 0; minute < 60; minute += 1) {
        trades.push(trade(seq++, 100 + minute, 5, minute * ONE_MINUTE));
      }

      const oneMinuteCandles = aggregateCandles(trades, ONE_MINUTE);
      const oneHourCandles = aggregateCandles(trades, ONE_HOUR);
      const rolledUp = rollUp(oneMinuteCandles);

      expect(oneHourCandles).toHaveLength(1);
      expect(rolledUp?.volume).toBe(oneHourCandles[0]?.volume);
      expect(rolledUp?.high).toBe(oneHourCandles[0]?.high);
      expect(rolledUp?.low).toBe(oneHourCandles[0]?.low);
      expect(rolledUp?.open).toBe(oneHourCandles[0]?.open);
      expect(rolledUp?.close).toBe(oneHourCandles[0]?.close);
    });
  });

  describe("Challenge 8c: Empty buckets", () => {
    test("Challenge 8c-1: a gap between trades is filled with the previous close, never a fabricated zero and never omitted", () => {
      const trades = [trade(1, 100, 1, 0), trade(2, 120, 1, 3 * ONE_MINUTE)];
      const candles = aggregateCandles(trades, ONE_MINUTE);
      const filled = fillGaps(candles, ONE_MINUTE);

      expect(filled).toHaveLength(4); // minute 0, 1, 2, 3
      expect(filled[1]?.tradeCount).toBe(0);
      expect(filled[1]?.close).toBe(100n);
      expect(filled[2]?.close).toBe(100n);
      expect(filled[3]?.close).toBe(120n);
    });
  });

  describe("Challenge 8d: VWAP", () => {
    test("Challenge 8d-1: VWAP is exact, with the discarded remainder reported rather than dropped", async () => {
      const response = await testSession.post("/api/market-data/vwap").send({
        trades: [
          { sequence: 1, price: "10", quantity: "3", timestampMs: 0 },
          { sequence: 2, price: "11", quantity: "4", timestampMs: 1 },
        ],
      });

      // (10*3 + 11*4) / 7 = 74/7 = 10 remainder 4
      expect(response.body.data.price).toBe("10");
      expect(response.body.data.remainder).toBe("4");
    });

    test("Challenge 8d-2: VWAP over an empty trade set is zero, not NaN or an error", () => {
      const result = vwap([]);
      expect(result.price).toBe(0n);
    });
  });

  describe("Challenge 8e: HTTP surface", () => {
    test("Challenge 8e-1: the candles endpoint aggregates and serialises correctly end to end", async () => {
      const response = await testSession.post("/api/market-data/candles").send({
        resolutionMs: ONE_MINUTE,
        trades: [
          { sequence: 1, price: "100", quantity: "1", timestampMs: 0 },
          { sequence: 2, price: "110", quantity: "1", timestampMs: 30_000 },
        ],
      });

      expect(response.status).toBe(HttpStatus.OK);
      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0].volume).toBe("2");
    });
  });

  describe("Challenge 8f: Late-arriving trades", () => {
    test("Challenge 8f-1: a trade arriving late with an earlier timestamp still rebuckets correctly at every resolution", async () => {
      const initial = [trade(1, 100, 5, 10 * ONE_MINUTE), trade(2, 200, 5, 65 * ONE_MINUTE)];
      // Sequence 3 arrives last (after trade 2) but carries the EARLIEST timestamp (minute 0). It is listed
      // first, so the array is in timestamp order while sequence order is 1, 2, 3 -- within hour 0, array
      // order and timestamp order both say [seq 3, seq 1] but sequence order says [seq 1, seq 3].
      const late = trade(3, 150, 5, 0);
      const allTrades = [late, ...initial];

      const minuteCandles = aggregateCandles(allTrades, ONE_MINUTE);
      const hourCandles = aggregateCandles(allTrades, ONE_HOUR);

      const minute0 = minuteCandles.find((c) => c.bucketStartMs === 0);
      expect(minute0?.open).toBe(150n);
      expect(minute0?.close).toBe(150n);
      expect(minute0?.volume).toBe(5n);

      const hour0 = hourCandles.find((c) => c.bucketStartMs === 0);
      expect(hour0?.open).toBe(100n); // seq 1 is first by sequence, although seq 3 has the earlier timestamp
      expect(hour0?.close).toBe(150n); // seq 3 is last by sequence, although seq 1 has the later timestamp
      expect(hour0?.high).toBe(150n);
      expect(hour0?.low).toBe(100n);
      expect(hour0?.volume).toBe(10n);

      const hour1 = hourCandles.find((c) => c.bucketStartMs === ONE_HOUR);
      expect(hour1?.open).toBe(200n);
      expect(hour1?.volume).toBe(5n);
    });
  });
});
