import fc from "fast-check";
import { expect, test, describe } from "vitest";
import { FeeEngine, type FeeFill, type FeeResult, type FeeTier } from "../src/domain/fees.js";

const json = (value: unknown): string => JSON.stringify(value, (_k, v) => (typeof v === "bigint" ? v.toString() : v));

// Independent oracle for round-half-even(x / d), x >= 0: round half UP first, then step back to the even
// neighbour on an exact tie. (A different formulation from quotient/remainder comparison.)
function halfEven(x: bigint, d: bigint): bigint {
  const up = (2n * x + d) / (2n * d);
  const isTie = (2n * x) % (2n * d) === d;
  return isTie && up % 2n === 1n ? up - 1n : up;
}
const feeOracle = (notional: bigint, bps: bigint): bigint => (bps < 0n ? -halfEven(notional * -bps, 10_000n) : halfEven(notional * bps, 10_000n));

const flatSchedule = (maker: bigint, taker: bigint): FeeTier[] => [{ minVolume: 0n, makerBps: maker, takerBps: taker }];
const options = { feeAccount: "fees", windowMs: 1000 };

let counter = 0;
function fill(timestampMs: number, maker: string, taker: string, notional: bigint, asset = "USD"): FeeFill {
  counter += 1;
  return { fillId: `f${counter}`, timestampMs, makerAccount: maker, takerAccount: taker, asset, notional };
}

const TIERS: FeeTier[] = [
  { minVolume: 0n, makerBps: 10n, takerBps: 20n },
  { minVolume: 1000n, makerBps: 8n, takerBps: 15n },
  { minVolume: 10_000n, makerBps: -5n, takerBps: 10n }, // top tier: makers are paid a rebate
];
const tierFor = (volume: bigint): FeeTier => [...TIERS].reverse().find((t) => t.minVolume <= volume)!;

const ACCOUNTS = ["acc-a", "acc-b", "acc-c"] as const;
const fillScriptArb = fc.array(
  fc.record({
    gap: fc.constantFrom(0, 1, 2, 300, 999, 1000, 1001, 2500),
    maker: fc.nat(2),
    taker: fc.nat(1),
    notional: fc.integer({ min: 1, max: 6000 }),
    asset: fc.constantFrom("USD", "EUR"),
  }),
  { minLength: 1, maxLength: 40 },
);

function buildFills(script: { gap: number; maker: number; taker: number; notional: number; asset: string }[]): FeeFill[] {
  let t = 0;
  return script.map((step) => {
    t += step.gap;
    const maker = ACCOUNTS[step.maker]!;
    const takerIndex = (step.maker + 1 + step.taker) % ACCOUNTS.length;
    return fill(t, maker, ACCOUNTS[takerIndex]!, BigInt(step.notional), step.asset);
  });
}

// Oracle: trailing volume = notionals of EARLIER fills involving the account with ts > t - window.
function oracleFees(fills: FeeFill[], windowMs: number): { makerFee: bigint; takerFee: bigint }[] {
  return fills.map((f, i) => {
    const volume = (account: string): bigint =>
      fills.slice(0, i).filter((p) => (p.makerAccount === account || p.takerAccount === account) && p.timestampMs > f.timestampMs - windowMs).reduce((sum, p) => sum + p.notional, 0n);
    return { makerFee: feeOracle(f.notional, tierFor(volume(f.makerAccount)).makerBps), takerFee: feeOracle(f.notional, tierFor(volume(f.takerAccount)).takerBps) };
  });
}

describe("Challenge 16: Fee and Rebate Engine", () => {
  describe("Challenge 16a: Exact fee arithmetic", () => {
    test("Challenge 16a-1: fees match an exact integer oracle for any notional, including those beyond 2^53, and rebates mirror fees", () => {
      fc.assert(
        fc.property(fc.bigInt({ min: 1n, max: 10n ** 20n }), fc.integer({ min: -30, max: 60 }), fc.integer({ min: -30, max: 60 }), (notional, makerBps, takerBps) => {
          const engine = new FeeEngine(flatSchedule(BigInt(makerBps), BigInt(takerBps)), options);
          const result = engine.processFill(fill(1, "m", "t", notional));
          expect(result.makerFee).toBe(feeOracle(notional, BigInt(makerBps)));
          expect(result.takerFee).toBe(feeOracle(notional, BigInt(takerBps)));
        }),
      );
    });

    test("Challenge 16a-2: an exact half rounds to the even integer, in both directions and for rebates", () => {
      const bpsChoices = [2n, 4n, 5n, 8n, 10n, 20n, 25n, 40n, 50n, 100n, 125n, 200n, 250n, 500n, 1000n];
      fc.assert(
        fc.property(fc.constantFrom(...bpsChoices), fc.bigInt({ min: 0n, max: 10n ** 15n }), fc.boolean(), (bps, k, rebate) => {
          // notional * bps = 5000 + 10000k, i.e. the fee is exactly (k + 0.5).
          const notional = 5000n / bps + (10_000n / bps) * k;
          const rate = rebate ? -bps : bps;
          const engine = new FeeEngine(flatSchedule(rate, rate), options);
          const result = engine.processFill(fill(1, "m", "t", notional));
          const magnitude = rebate ? -result.makerFee : result.makerFee;
          expect(magnitude % 2n).toBe(0n);
          expect(magnitude === k || magnitude === k + 1n).toBe(true);
          expect(result.takerFee).toBe(result.makerFee);
        }),
      );
      // Readable examples: 0.5 -> 0, 1.5 -> 2, 2.5 -> 2.
      const engine = new FeeEngine(flatSchedule(50n, 0n), options);
      expect(engine.processFill(fill(1, "m", "t", 100n)).makerFee).toBe(0n);
      expect(engine.processFill(fill(1, "m", "t", 300n)).makerFee).toBe(2n);
      expect(engine.processFill(fill(1, "m", "t", 500n)).makerFee).toBe(2n);
    });
  });

  describe("Challenge 16b: Volume tiers", () => {
    test("Challenge 16b-1: each side's tier comes from its own trailing volume before the fill, matching an independent oracle", () => {
      fc.assert(
        fc.property(fillScriptArb, (script) => {
          const fills = buildFills(script);
          const engine = new FeeEngine(TIERS, options);
          const expected = oracleFees(fills, options.windowMs);
          fills.forEach((f, i) => {
            const result = engine.processFill(f);
            expect(result.makerFee).toBe(expected[i]!.makerFee);
            expect(result.takerFee).toBe(expected[i]!.takerFee);
          });
          const last = fills[fills.length - 1]!.timestampMs;
          for (const at of [last, last + 1, last + 999, last + 1000]) {
            for (const account of ACCOUNTS) {
              const want = fills.filter((p) => (p.makerAccount === account || p.takerAccount === account) && p.timestampMs > at - options.windowMs).reduce((sum, p) => sum + p.notional, 0n);
              expect(engine.trailingVolume(account, at)).toBe(want);
            }
          }
        }),
        { numRuns: 200 },
      );
    });

    test("Challenge 16b-2: a fill exactly one window old has expired from the trailing volume, one millisecond younger has not", () => {
      const schedule: FeeTier[] = [
        { minVolume: 0n, makerBps: 10n, takerBps: 0n },
        { minVolume: 1_000_000n, makerBps: 8n, takerBps: 0n },
      ];
      const engine = new FeeEngine(schedule, options);
      expect(engine.processFill(fill(0, "a", "x", 1_000_000n)).makerFee).toBe(1000n); // volume 0 -> 10 bps
      expect(engine.processFill(fill(999, "a", "y", 500_000n)).makerFee).toBe(400n); // volume 1_000_000 -> 8 bps
      // At t = 1000 the t = 0 fill is exactly one window old: expired, leaving 500_000 -> back to 10 bps.
      expect(engine.processFill(fill(1000, "a", "z", 2_000_000n)).makerFee).toBe(2000n);
    });
  });

  describe("Challenge 16c: Fees are posted as balanced ledger entries", () => {
    test("Challenge 16c-1: every entry balances, fees and rebates flow the right way, and the fee account nets to the fees collected", () => {
      fc.assert(
        fc.property(fillScriptArb, (script) => {
          const fills = buildFills(script);
          const engine = new FeeEngine(TIERS, options);
          const net = new Map<string, bigint>();
          let collected = 0n;
          for (const f of fills) {
            const result: FeeResult = engine.processFill(f);
            collected += result.makerFee + result.takerFee;
            const sides = [
              { role: "maker", account: f.makerAccount, fee: result.makerFee },
              { role: "taker", account: f.takerAccount, fee: result.takerFee },
            ].filter((s) => s.fee !== 0n);
            expect(result.entries.map((e) => e.entryId)).toEqual(sides.map((s) => `${f.fillId}:${s.role}`));
            result.entries.forEach((entry, i) => {
              const side = sides[i]!;
              expect(entry.lines).toHaveLength(2);
              expect(entry.lines[0]).toEqual({ account: side.account, asset: f.asset, amount: -side.fee });
              expect(entry.lines[1]).toEqual({ account: "fees", asset: f.asset, amount: side.fee });
              expect(entry.lines[0]!.amount + entry.lines[1]!.amount).toBe(0n);
              for (const line of entry.lines) net.set(`${line.account}|${line.asset}`, (net.get(`${line.account}|${line.asset}`) ?? 0n) + line.amount);
            });
          }
          expect([...net.values()].reduce((a, b) => a + b, 0n)).toBe(0n);
          const feeAccountNet = [...net.entries()].filter(([k]) => k.startsWith("fees|")).reduce((a, [, v]) => a + v, 0n);
          expect(feeAccountNet).toBe(collected);
        }),
      );
    });
  });

  describe("Challenge 16d: Idempotency", () => {
    test("Challenge 16d-1: a redelivered fill returns the original result and changes neither volume, tiers nor the timestamp clock", () => {
      fc.assert(
        fc.property(fillScriptArb, (script) => {
          const fills = buildFills(script);
          const clean = new FeeEngine(TIERS, options);
          const noisy = new FeeEngine(TIERS, options);
          const expected = fills.map((f) => clean.processFill(f));
          const seen: FeeResult[] = [];
          fills.forEach((f, i) => {
            const result = noisy.processFill(f);
            seen.push(result);
            // Redeliver this and an earlier fill, the latter with a much later timestamp than any real one.
            expect(noisy.processFill(f)).toEqual(result);
            const earlier = fills[Math.max(0, i - 1)]!;
            expect(noisy.processFill({ ...earlier, timestampMs: f.timestampMs + 5_000_000 })).toEqual(seen[Math.max(0, i - 1)]);
          });
          expect(json(seen)).toBe(json(expected));
        }),
      );
    });
  });

  describe("Challenge 16e: Scale", () => {
    test("Challenge 16e-1: 200,000 fills with a wide trailing window are priced exactly and quickly", () => {
      let seed = 987654321;
      const rand = (max: number): number => {
        seed = (seed * 1103515245 + 12345) & 0x7fffffff;
        return seed % max;
      };
      const windowMs = 60_000;
      const tiers: FeeTier[] = [
        { minVolume: 0n, makerBps: 12n, takerBps: 25n },
        { minVolume: 100_000_000_000_000n, makerBps: 8n, takerBps: 18n },
        { minVolume: 1_000_000_000_000_000n, makerBps: -3n, takerBps: 10n },
      ];
      const names = Array.from({ length: 30 }, (_, i) => `big-${i}`);
      const fills: FeeFill[] = [];
      let t = 0;
      for (let i = 0; i < 200_000; i += 1) {
        t += rand(6);
        const maker = rand(30);
        const taker = (maker + 1 + rand(29)) % 30;
        fills.push({ fillId: `s${i}`, timestampMs: t, makerAccount: names[maker]!, takerAccount: names[taker]!, asset: "USD", notional: BigInt(rand(1_000_000)) * 1_000_003n + 1n });
      }

      const engine = new FeeEngine(tiers, { feeAccount: "fees", windowMs });
      const started = Date.now();
      const results = fills.map((f) => engine.processFill(f));
      const elapsed = Date.now() - started;

      // Oracle: per-account prefix sums over time, queried with a binary search.
      const times = new Map<string, number[]>();
      const cumulative = new Map<string, bigint[]>();
      const volumeBefore = (account: string, at: number): bigint => {
        const ts = times.get(account);
        if (!ts) return 0n;
        const cum = cumulative.get(account)!;
        let lo = 0;
        let hi = ts.length;
        while (lo < hi) {
          const mid = (lo + hi) >>> 1;
          if (ts[mid]! <= at - windowMs) lo = mid + 1;
          else hi = mid;
        }
        return cum[ts.length]! - cum[lo]!;
      };
      const tier = (v: bigint): FeeTier => [...tiers].reverse().find((x) => x.minVolume <= v)!;
      let mismatches = 0;
      fills.forEach((f, i) => {
        const wantMaker = feeOracle(f.notional, tier(volumeBefore(f.makerAccount, f.timestampMs)).makerBps);
        const wantTaker = feeOracle(f.notional, tier(volumeBefore(f.takerAccount, f.timestampMs)).takerBps);
        if (results[i]!.makerFee !== wantMaker || results[i]!.takerFee !== wantTaker) mismatches += 1;
        for (const account of [f.makerAccount, f.takerAccount]) {
          const ts = times.get(account) ?? [];
          const cum = cumulative.get(account) ?? [0n];
          ts.push(f.timestampMs);
          cum.push(cum[cum.length - 1]! + f.notional);
          times.set(account, ts);
          cumulative.set(account, cum);
        }
      });
      expect(mismatches).toBe(0);
      expect(elapsed).toBeLessThan(4000);
    });
  });

  describe("Challenge 16f: Input validation", () => {
    test("Challenge 16f-1: invalid schedules, options and fills throw RangeError", () => {
      expect(() => new FeeEngine([], options)).toThrow(RangeError);
      expect(() => new FeeEngine([{ minVolume: 5n, makerBps: 1n, takerBps: 1n }], options)).toThrow(RangeError);
      expect(() => new FeeEngine([{ minVolume: 0n, makerBps: 1n, takerBps: 1n }, { minVolume: 0n, makerBps: 1n, takerBps: 1n }], options)).toThrow(RangeError);
      expect(() => new FeeEngine(flatSchedule(1n, 1n), { feeAccount: "fees", windowMs: 0 })).toThrow(RangeError);
      expect(() => new FeeEngine(flatSchedule(1n, 1n), { feeAccount: "", windowMs: 1000 })).toThrow(RangeError);

      const engine = new FeeEngine(flatSchedule(1n, 1n), options);
      expect(() => engine.processFill(fill(1, "a", "b", 0n))).toThrow(RangeError);
      expect(() => engine.processFill(fill(1, "a", "b", -5n))).toThrow(RangeError);
      expect(() => engine.processFill(fill(1, "a", "a", 5n))).toThrow(RangeError);
      expect(() => engine.processFill(fill(1, "", "b", 5n))).toThrow(RangeError);
      engine.processFill(fill(100, "a", "b", 5n));
      expect(() => engine.processFill(fill(99, "a", "b", 5n))).toThrow(RangeError);
    });
  });
});
