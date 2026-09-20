import fc from "fast-check";
import { expect, test, describe } from "vitest";
import { netObligations, type Obligation, type Transfer } from "../src/domain/netting.js";

let counter = 0;
function ob(from: string, to: string, amount: bigint, asset = "USD"): Obligation {
  counter += 1;
  return { id: `o${counter}`, from, to, asset, amount };
}

// Independent oracle: net position per asset per account = owed TO the account minus owed BY it.
function positions(obligations: readonly Obligation[]): Map<string, Map<string, bigint>> {
  const result = new Map<string, Map<string, bigint>>();
  for (const o of obligations) {
    const book = result.get(o.asset) ?? new Map<string, bigint>();
    book.set(o.from, (book.get(o.from) ?? 0n) - o.amount);
    book.set(o.to, (book.get(o.to) ?? 0n) + o.amount);
    result.set(o.asset, book);
  }
  return result;
}

function flows(transfers: readonly Transfer[]): Map<string, Map<string, bigint>> {
  const result = new Map<string, Map<string, bigint>>();
  for (const t of transfers) {
    const book = result.get(t.asset) ?? new Map<string, bigint>();
    book.set(t.from, (book.get(t.from) ?? 0n) - t.amount);
    book.set(t.to, (book.get(t.to) ?? 0n) + t.amount);
    result.set(t.asset, book);
  }
  return result;
}

function nonZero(book: Map<string, bigint> | undefined): bigint[] {
  return [...(book?.values() ?? [])].filter((v) => v !== 0n);
}

// Brute-force oracle: the maximum number of disjoint zero-sum groups the balances can be split
// into. Deliberately a different formulation (submask enumeration) from any DP a solution is likely
// to use. The minimum number of transfers is (accounts with a non-zero balance) - (that maximum).
function maxZeroSumGroups(balances: readonly bigint[]): number {
  const n = balances.length;
  const size = 1 << n;
  const sum = new Array<bigint>(size).fill(0n);
  for (let mask = 1; mask < size; mask += 1) {
    let s = 0n;
    for (let i = 0; i < n; i += 1) if (mask & (1 << i)) s += balances[i]!;
    sum[mask] = s;
  }
  const best = new Int32Array(size);
  for (let mask = 1; mask < size; mask += 1) {
    if (sum[mask] !== 0n) continue;
    const low = mask & -mask;
    const rest = mask ^ low;
    let top = 0;
    for (let sub = rest; ; sub = (sub - 1) & rest) {
      const group = sub | low;
      if (sum[group] === 0n) top = Math.max(top, 1 + best[mask ^ group]!);
      if (sub === 0) break;
    }
    best[mask] = top;
  }
  return best[size - 1]!;
}

function minimumTransfers(book: Map<string, bigint> | undefined): number {
  const balances = nonZero(book);
  return balances.length === 0 ? 0 : balances.length - maxZeroSumGroups(balances);
}

const canonical = (t: readonly Transfer[]): string =>
  JSON.stringify(t, (_k, v) => (typeof v === "bigint" ? v.toString() : v));

function shuffled<T>(items: readonly T[], keys: readonly number[]): T[] {
  return items.map((item, i) => ({ item, key: keys[i % keys.length]! * 1000 + i })).sort((a, b) => a.key - b.key).map((x) => x.item);
}

// Generators. Accounts are partitioned into "clusters" whose members only owe each other, so every
// cluster's net positions sum to zero by construction (planted zero-sum groups). The oracle never
// trusts that: it recomputes positions from the obligations themselves.
const clusterArb = (maxAmount: number) =>
  fc.record({
    size: fc.integer({ min: 2, max: 5 }),
    edges: fc.array(fc.tuple(fc.nat(4), fc.nat(4), fc.integer({ min: 1, max: maxAmount })), { minLength: 1, maxLength: 8 }),
  });

function buildObligations(clusters: { size: number; edges: [number, number, number][] }[], asset: string, prefix = "acct"): Obligation[] {
  const result: Obligation[] = [];
  clusters.forEach((cluster, c) => {
    for (const [a, b, amount] of cluster.edges) {
      const from = a % cluster.size;
      const to = b % cluster.size;
      if (from === to) continue;
      result.push(ob(`${prefix}-${c}-${from}`, `${prefix}-${c}-${to}`, BigInt(amount), asset));
    }
  });
  return result;
}

const smallBatchArb = fc.array(clusterArb(30), { minLength: 1, maxLength: 3 }).map((clusters) => buildObligations(clusters, "USD"));

describe("Challenge 14: Netting and Multilateral Settlement", () => {
  describe("Challenge 14a: Net positions are preserved", () => {
    test("Challenge 14a-1: applying the transfers reproduces every account's net position exactly, per asset", () => {
      fc.assert(
        fc.property(fc.array(clusterArb(1000), { minLength: 1, maxLength: 4 }), fc.array(clusterArb(1000), { minLength: 0, maxLength: 3 }), (usd, eur) => {
          const obligations = [...buildObligations(usd, "USD"), ...buildObligations(eur, "EUR", "eu")];
          const transfers = netObligations(obligations);
          const before = positions(obligations);
          const after = flows(transfers);
          for (const asset of new Set([...before.keys(), ...after.keys()])) {
            const accounts = new Set([...(before.get(asset)?.keys() ?? []), ...(after.get(asset)?.keys() ?? [])]);
            for (const account of accounts) {
              expect(after.get(asset)?.get(account) ?? 0n).toBe(before.get(asset)?.get(account) ?? 0n);
            }
          }
        }),
      );
    });

    test("Challenge 14a-2: transfers are well formed, and only net debtors pay and only net creditors receive", () => {
      fc.assert(
        fc.property(smallBatchArb, (obligations) => {
          const transfers = netObligations(obligations);
          const before = positions(obligations).get("USD") ?? new Map<string, bigint>();
          for (const t of transfers) {
            expect(t.amount > 0n).toBe(true);
            expect(t.from).not.toBe(t.to);
            expect(t.asset).toBe("USD");
            expect(before.get(t.from) ?? 0n).toBeLessThan(0n);
            expect(before.get(t.to) ?? 0n).toBeGreaterThan(0n);
          }
          expect(transfers.length).toBeLessThanOrEqual(Math.max(0, nonZero(before).length - 1));
        }),
      );
    });
  });

  describe("Challenge 14b: Cycles cancel", () => {
    test("Challenge 14b-1: a cycle of equal obligations of any length contributes no transfer at all", () => {
      fc.assert(
        fc.property(smallBatchArb, fc.integer({ min: 3, max: 8 }), fc.integer({ min: 1, max: 1_000_000 }), (base, length, amount) => {
          const cycle = Array.from({ length }, (_, i) => ob(`ring-${i}`, `ring-${(i + 1) % length}`, BigInt(amount)));
          expect(netObligations(cycle)).toEqual([]);
          expect(canonical(netObligations([...base, ...cycle]))).toBe(canonical(netObligations(base)));
        }),
      );
    });
  });

  describe("Challenge 14c: The transfer count is the minimum", () => {
    test("Challenge 14c-1: the number of transfers equals the brute-force minimum, on batches with planted zero-sum groups", () => {
      fc.assert(
        fc.property(fc.array(clusterArb(12), { minLength: 1, maxLength: 3 }), (clusters) => {
          const obligations = buildObligations(clusters, "USD");
          const book = positions(obligations).get("USD");
          fc.pre(nonZero(book).length <= 13);
          expect(netObligations(obligations)).toHaveLength(minimumTransfers(book));
        }),
        { numRuns: 200 },
      );

      // Larger planted groups: two or three independent clusters of 4-5 accounts each, so a solution
      // that only cancels pairs and triples and then settles the remainder as one group is caught.
      const bigCluster = fc.record({
        size: fc.integer({ min: 4, max: 5 }),
        edges: fc.array(fc.tuple(fc.nat(4), fc.nat(4), fc.integer({ min: 1, max: 40 })), { minLength: 6, maxLength: 12 }),
      });
      fc.assert(
        fc.property(fc.array(bigCluster, { minLength: 2, maxLength: 2 }), (clusters) => {
          const obligations = buildObligations(clusters, "USD");
          const book = positions(obligations).get("USD");
          fc.pre(nonZero(book).length <= 10);
          expect(netObligations(obligations)).toHaveLength(minimumTransfers(book));
        }),
        { numRuns: 200 },
      );
    });
  });

  describe("Challenge 14d: Assets and ordering", () => {
    test("Challenge 14d-1: assets are netted independently — the combined result is the per-asset results together", () => {
      fc.assert(
        fc.property(fc.array(clusterArb(50), { minLength: 1, maxLength: 3 }), fc.array(clusterArb(50), { minLength: 1, maxLength: 3 }), (usd, btc) => {
          const usdObligations = buildObligations(usd, "USD");
          const btcObligations = buildObligations(btc, "BTC");
          const combined = netObligations([...usdObligations, ...btcObligations]);
          const separate = [...netObligations(usdObligations), ...netObligations(btcObligations)];
          expect(combined.every((t) => t.asset === "USD" || t.asset === "BTC")).toBe(true);
          expect(canonical(combined)).toBe(canonical(separate.sort((a, b) => (a.asset < b.asset ? -1 : a.asset > b.asset ? 1 : 0))));
        }),
      );
    });

    test("Challenge 14d-2: the result is identical for any input order and for any splitting of an obligation", () => {
      fc.assert(
        fc.property(smallBatchArb, fc.array(fc.integer({ min: 0, max: 1000 }), { minLength: 1, maxLength: 20 }), (obligations, keys) => {
          const expected = canonical(netObligations(obligations));
          expect(canonical(netObligations(shuffled(obligations, keys)))).toBe(expected);

          const split = obligations.flatMap((o) => (o.amount > 1n ? [{ ...o, id: `${o.id}a`, amount: 1n }, { ...o, id: `${o.id}b`, amount: o.amount - 1n }] : [o]));
          expect(canonical(netObligations(shuffled(split, keys)))).toBe(expected);
        }),
      );
    });
  });

  describe("Challenge 14e: Scale", () => {
    test("Challenge 14e-1: a large batch with thousands of planted pairs and triples is netted correctly within the time budget", () => {
      let seed = 12345;
      const rand = (max: number): number => {
        seed = (seed * 1103515245 + 12345) & 0x7fffffff;
        return seed % max;
      };
      const big = (): bigint => BigInt(rand(1_000_000)) * 1_000_003n + BigInt(rand(1_000_003)) + 1n;

      const obligations: Obligation[] = [];
      const clusterMembers: string[][] = [];
      for (let c = 0; c < 1600; c += 1) {
        const size = 2 + (c % 2);
        const members = Array.from({ length: size }, (_, i) => `big-${c}-${i}`);
        clusterMembers.push(members);
        for (let k = 0; k < 60; k += 1) {
          const a = rand(size);
          const b = (a + 1 + rand(size - 1)) % size;
          obligations.push(ob(members[a]!, members[b]!, big()));
        }
      }
      // Shuffle so clusters are not adjacent in the input.
      for (let i = obligations.length - 1; i > 0; i -= 1) {
        const j = rand(i + 1);
        [obligations[i], obligations[j]] = [obligations[j]!, obligations[i]!];
      }

      const started = Date.now();
      const transfers = netObligations(obligations);
      const elapsed = Date.now() - started;

      const before = positions(obligations).get("USD")!;
      const after = flows(transfers).get("USD") ?? new Map<string, bigint>();
      for (const [account, position] of before) expect(after.get(account) ?? 0n).toBe(position);

      // Every cluster's non-zero members can be settled among themselves in (members - 1) transfers.
      let bound = 0;
      for (const members of clusterMembers) {
        const live = members.filter((m) => (before.get(m) ?? 0n) !== 0n).length;
        if (live > 0) bound += live - 1;
      }
      expect(transfers.length).toBeLessThanOrEqual(bound);
      expect(elapsed).toBeLessThan(5000);
    });
  });

  describe("Challenge 14f: Input validation", () => {
    test("Challenge 14f-1: invalid obligations throw RangeError, and an empty batch nets to nothing", () => {
      expect(netObligations([])).toEqual([]);
      expect(() => netObligations([ob("a", "b", 0n)])).toThrow(RangeError);
      expect(() => netObligations([ob("a", "b", -5n)])).toThrow(RangeError);
      expect(() => netObligations([ob("a", "a", 5n)])).toThrow(RangeError);
      expect(() => netObligations([ob("", "b", 5n)])).toThrow(RangeError);
      expect(() => netObligations([ob("a", "b", 5n, "")])).toThrow(RangeError);
      expect(() => netObligations([ob("a", "b", 5n), ob("c", "c", 1n)])).toThrow(RangeError);
    });
  });
});
