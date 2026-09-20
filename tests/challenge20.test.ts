import fc from "fast-check";
import { JSDOM } from "jsdom";
import type { Agent } from "supertest";
import app from "../src/server.js";
import db from "../db/db-config.js";
import testBase from "./testBase.js";
import { expect, test, describe, beforeAll, afterAll, afterEach } from "vitest";
import HttpStatus from "../src/enums/httpStatus.js";
import { renderAccountList, renderPortfolioSummary, renderRiskUsage, renderRecentTrades } from "../client/js/dashboard.js";

let testSession: Agent;

beforeAll(async () => {
  testSession = testBase.createSuperTestSession(app);
  await testBase.resetDatabase(db);
});
afterEach(async () => {
  await testBase.resetDatabase(db);
});
afterAll(async () => {
  await new Promise<void>((resolve, reject) => {
    app.close((err) => (err ? reject(err) : resolve()));
  });
});

const ASSETS = [
  { code: "USD", name: "US Dollar", exponent: 2 },
  { code: "EUR", name: "Euro", exponent: 2 },
  { code: "JPY", name: "Japanese Yen", exponent: 0 },
  { code: "BHD", name: "Bahraini Dinar", exponent: 3 },
  { code: "BTC", name: "Bitcoin", exponent: 8 },
];
const KNOWN = ASSETS.map((asset) => asset.code);

// Independent formatter for the oracle: an exact decimal string from minor units.
function fmt(amount: bigint, exponent: number): string {
  const negative = amount < 0n;
  const abs = negative ? -amount : amount;
  const scale = 10n ** BigInt(exponent);
  const whole = (abs / scale).toString();
  const fraction = (abs % scale).toString().padStart(exponent, "0");
  return (negative && abs !== 0n ? "-" : "") + (exponent === 0 ? whole : whole + "." + fraction);
}
const exponentOf = (code: string): number => ASSETS.find((asset) => asset.code === code)!.exponent;

function page(): Document {
  return new JSDOM(`<!doctype html><body><section id="accounts-view"></section><section id="summary-view"></section><section id="risk-usage-view"></section><section id="activity-view"></section></body>`).window.document;
}

type Balance = { asset: string; available: string; held: string; total: string };
type Account = { id: string; type: string; name: string; status: string; balances: Balance[] };

const balanceArb = fc.record({ asset: fc.constantFrom(...KNOWN), available: fc.bigInt({ min: 0n, max: 10n ** 24n }), held: fc.bigInt({ min: 0n, max: 10n ** 20n }) });
const accountsArb = fc.array(
  fc.record({
    name: fc.oneof(fc.constantFrom("Alice", "alice", "Bob", "Carol", "Zed", "<img src=x onerror=alert(1)>"), fc.string({ minLength: 1, maxLength: 8 })),
    status: fc.constantFrom("active", "closed"),
    balances: fc.uniqueArray(balanceArb, { maxLength: 4, selector: (b) => b.asset }),
  }),
  { maxLength: 12 },
).map((items): Account[] =>
  items.map((item, index) => ({
    id: `acct-${index}`,
    type: "asset",
    name: item.name,
    status: item.status,
    balances: item.balances.map((b) => ({ asset: b.asset, available: b.available.toString(), held: b.held.toString(), total: (b.available + b.held).toString() })),
  })),
);

const nameOrder = (a: Account, b: Account): number => {
  const x = a.name.toLowerCase();
  const y = b.name.toLowerCase();
  return x < y ? -1 : x > y ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
};

describe("Challenge 20: Dashboard and Demo Data", () => {
  describe("Challenge 20a: Initial data", () => {
    test("Challenge 20a-1: running the demo seed creates at least five funded trading accounts, each holding at least two known assets", async () => {
      await db.seed.run({ specific: "01_initial_accounts.ts" });

      const accounts = await db("accounts").where({ type: "asset" }).select("id");
      expect(accounts.length).toBeGreaterThanOrEqual(5);
      const names = new Set((await db("accounts").where({ type: "asset" }).select("name")).map((row: { name: string }) => row.name));
      expect(names.size).toBe(accounts.length);

      for (const { id } of accounts as { id: string }[]) {
        const rows = (await db("account_balances").where({ account_id: id }).select("asset", "available")) as { asset: string; available: string }[];
        const funded = rows.filter((row) => BigInt(row.available) > 0n);
        expect(funded.length, `account ${id} needs at least two funded assets`).toBeGreaterThanOrEqual(2);
        for (const row of funded) expect(KNOWN).toContain(row.asset);
      }
    });

    test("Challenge 20a-2: the initial funding is double-entry: every entry balances, the ledger sums to zero per asset, and postings agree with the stored balances", async () => {
      await db.seed.run({ specific: "01_initial_accounts.ts" });

      const postings = (await db("postings").select("entry_id", "account_id", "asset", "amount")) as { entry_id: string; account_id: string; asset: string; amount: string }[];
      expect(postings.length).toBeGreaterThan(0);

      const perEntry = new Map<string, bigint>();
      const perAsset = new Map<string, bigint>();
      const perAccountAsset = new Map<string, bigint>();
      for (const p of postings) {
        const amount = BigInt(p.amount);
        perEntry.set(`${p.entry_id}|${p.asset}`, (perEntry.get(`${p.entry_id}|${p.asset}`) ?? 0n) + amount);
        perAsset.set(p.asset, (perAsset.get(p.asset) ?? 0n) + amount);
        perAccountAsset.set(`${p.account_id}|${p.asset}`, (perAccountAsset.get(`${p.account_id}|${p.asset}`) ?? 0n) + amount);
      }
      for (const [key, sum] of perEntry) expect(sum, `entry ${key} does not balance`).toBe(0n);
      for (const [asset, sum] of perAsset) expect(sum, `${asset} does not sum to zero`).toBe(0n);

      const balances = (await db("account_balances").select("account_id", "asset", "available")) as { account_id: string; asset: string; available: string }[];
      for (const row of balances) expect(perAccountAsset.get(`${row.account_id}|${row.asset}`) ?? 0n).toBe(BigInt(row.available));
    });

    test("Challenge 20a-3: running the seed again changes nothing", async () => {
      const snapshot = async () =>
        JSON.stringify({
          accounts: await db("accounts").select("id", "type", "name").orderBy("id"),
          balances: await db("account_balances").select("account_id", "asset", "available", "held").orderBy(["account_id", "asset"]),
          postings: await db("postings").select("account_id", "asset", "amount").orderBy(["account_id", "asset", "amount"]),
        });

      await db.seed.run({ specific: "01_initial_accounts.ts" });
      const first = await snapshot();
      await db.seed.run({ specific: "01_initial_accounts.ts" });
      expect(await snapshot()).toBe(first);
      expect(JSON.parse(first).accounts.length).toBeGreaterThanOrEqual(5);
    });
  });

  describe("Challenge 20b: The accounts API", () => {
    test("Challenge 20b-1: GET /api/ledger/accounts lists every account with its balances, sorted by name", async () => {
      await db.seed.run({ specific: "01_initial_accounts.ts" });
      const created = await testSession.post("/api/ledger/accounts").send({ type: "asset", name: "aaa-empty-account" });
      expect(created.status).toBe(HttpStatus.CREATED);

      const response = await testSession.get("/api/ledger/accounts");
      expect(response.status).toBe(HttpStatus.OK);
      const listed = response.body.data as Account[];

      const rows = (await db("accounts").select("id", "type", "name", "status")) as { id: string; type: string; name: string; status: string }[];
      expect(listed.map((a) => a.id).sort()).toEqual(rows.map((r) => r.id).sort());
      expect(listed.map((a) => a.name.toLowerCase())).toEqual([...listed.map((a) => a.name.toLowerCase())].sort());

      const stored = (await db("account_balances").select("account_id", "asset", "available", "held")) as { account_id: string; asset: string; available: string; held: string }[];
      for (const account of listed) {
        const expected = stored
          .filter((row) => row.account_id === account.id)
          .map((row) => ({ asset: row.asset, available: row.available, held: row.held, total: (BigInt(row.available) + BigInt(row.held)).toString() }))
          .sort((a, b) => (a.asset < b.asset ? -1 : 1));
        expect([...account.balances].sort((a, b) => (a.asset < b.asset ? -1 : 1))).toEqual(expected);
      }
      expect(listed.find((a) => a.id === created.body.data.id)?.balances).toEqual([]);
    });
  });

  describe("Challenge 20c: An informative dashboard", () => {
    test("Challenge 20c-1: the account list shows every account by name with exact, exponent-aware holdings and a status badge", () => {
      fc.assert(
        fc.property(accountsArb, (accounts) => {
          const doc = page();
          renderAccountList(doc, accounts, ASSETS);
          const section = doc.getElementById("accounts-view")!;

          if (accounts.length === 0) {
            expect(section.dataset.state).toBe("empty");
            expect(section.textContent?.trim()).not.toBe("");
            return;
          }
          expect(section.dataset.state).toBe("ready");
          expect(section.querySelectorAll("img").length).toBe(0);
          const rows = [...section.querySelectorAll("[data-account-id]")] as HTMLElement[];
          const expected = [...accounts].sort(nameOrder);
          expect(rows.map((row) => row.dataset.accountId)).toEqual(expected.map((a) => a.id));

          expected.forEach((account, i) => {
            const row = rows[i]!;
            expect(row.textContent).toContain(account.name);
            expect(row.querySelector("[data-status]")?.getAttribute("data-status")).toBe(account.status);
            const shown = [...row.querySelectorAll("[data-asset]")].map((el) => [el.getAttribute("data-asset"), el.textContent]);
            expect(shown).toEqual(account.balances.map((b) => [b.asset, `${b.asset} ${fmt(BigInt(b.total), exponentOf(b.asset))}`]));
          });
        }),
      );
    });

    test("Challenge 20c-2: the portfolio summary counts the accounts and adds each asset up exactly across all of them", () => {
      fc.assert(
        fc.property(accountsArb, (accounts) => {
          const doc = page();
          renderPortfolioSummary(doc, accounts, ASSETS);
          const section = doc.getElementById("summary-view")!;

          if (accounts.length === 0) {
            expect(section.dataset.state).toBe("empty");
            return;
          }
          expect(section.dataset.state).toBe("ready");
          expect(section.querySelector('[data-summary="accounts"]')?.textContent).toBe(String(accounts.length));

          const totals = new Map<string, { total: bigint; holders: number }>();
          for (const account of accounts) {
            for (const b of account.balances) {
              const entry = totals.get(b.asset) ?? { total: 0n, holders: 0 };
              entry.total += BigInt(b.total);
              if (BigInt(b.total) !== 0n) entry.holders += 1;
              totals.set(b.asset, entry);
            }
          }
          const cards = [...section.querySelectorAll(".asset-total")] as HTMLElement[];
          expect(cards.map((card) => card.dataset.asset)).toEqual([...totals.keys()].sort());
          for (const card of cards) {
            const entry = totals.get(card.dataset.asset!)!;
            expect(card.querySelector(".amount")?.textContent).toBe(fmt(entry.total, exponentOf(card.dataset.asset!)));
            expect(card.querySelector(".holders")?.textContent).toBe(String(entry.holders));
          }
        }),
      );
    });

    test("Challenge 20c-3: risk usage shows how much of each limit is used, with a meter that turns to warning at 80% and danger at 100%", () => {
      fc.assert(
        fc.property(fc.integer({ min: 0, max: 200 }), fc.integer({ min: 0, max: 120 }), fc.bigInt({ min: -50n, max: 5_000_000n }), fc.bigInt({ min: 0n, max: 5_000_000n }), (openOrders, maxOpenOrders, exposure, maxNotional) => {
          const doc = page();
          renderRiskUsage(doc, { openOrderCount: openOrders, committedExposure: exposure.toString() }, { maxNotional: maxNotional.toString(), maxOpenOrders, maxPositionAbs: "1000" });

          const percentOf = (used: bigint, limit: bigint): number => (used <= 0n ? 0 : limit <= 0n ? 100 : Number((used * 100n) / limit));
          const expectations: [string, number][] = [
            ["orders", percentOf(BigInt(openOrders), BigInt(maxOpenOrders))],
            ["exposure", percentOf(exposure, maxNotional)],
          ];
          expect(doc.getElementById("risk-usage-view")!.dataset.state).toBe("ready");
          for (const [key, percent] of expectations) {
            const meter = doc.querySelector(`[data-meter="${key}"]`) as HTMLElement;
            expect(meter.querySelector(".percent")?.textContent).toBe(`${percent}%`);
            const progress = meter.querySelector("progress") as HTMLProgressElement;
            expect(progress.max).toBe(100);
            expect(progress.value).toBe(Math.min(percent, 100));
            expect(meter.dataset.level).toBe(percent >= 100 ? "danger" : percent >= 80 ? "warning" : "ok");
          }
        }),
      );
    });

    test("Challenge 20c-4: recent trades lists at most ten, newest first, each with its exact notional, and says so when there are none", () => {
      const tradeArb = fc.record({
        market: fc.constantFrom("BTC-USD", "EUR-USD"),
        buyOrderId: fc.string({ minLength: 1, maxLength: 4 }),
        sellOrderId: fc.string({ minLength: 1, maxLength: 4 }),
        price: fc.bigInt({ min: 1n, max: 10n ** 12n }).map((v) => v.toString()),
        quantity: fc.bigInt({ min: 1n, max: 10n ** 9n }).map((v) => v.toString()),
        timestampMs: fc.integer({ min: 1_700_000_000_000, max: 1_700_000_000_000 + 50 }),
      });
      fc.assert(
        fc.property(fc.array(tradeArb, { maxLength: 30 }), (trades) => {
          const doc = page();
          renderRecentTrades(doc, trades);
          const section = doc.getElementById("activity-view")!;
          if (trades.length === 0) {
            expect(section.dataset.state).toBe("empty");
            expect(section.textContent?.trim()).not.toBe("");
            return;
          }
          const expected = trades
            .map((trade, index) => ({ trade, index }))
            .sort((a, b) => b.trade.timestampMs - a.trade.timestampMs || b.index - a.index)
            .slice(0, 10)
            .map((x) => x.trade);
          const items = [...section.querySelectorAll("[data-trade]")];
          expect(items).toHaveLength(expected.length);
          items.forEach((item, i) => {
            const trade = expected[i]!;
            expect(item.textContent).toContain(`${trade.market} ${trade.quantity} @ ${trade.price}`);
            expect(item.querySelector("[data-notional]")?.textContent).toBe((BigInt(trade.price) * BigInt(trade.quantity)).toString());
            expect(item.querySelector("time")?.getAttribute("datetime")).toBe(new Date(trade.timestampMs).toISOString());
          });
        }),
      );
    });
  });
});
