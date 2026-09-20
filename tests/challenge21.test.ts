import fc from "fast-check";
import { JSDOM } from "jsdom";
import type { AddressInfo } from "node:net";
import type { Agent } from "supertest";
import { WebSocket } from "ws";
import app from "../src/server.js";
import db from "../db/db-config.js";
import testBase from "./testBase.js";
import { expect, test, describe, beforeAll, afterAll, afterEach } from "vitest";
import HttpStatus from "../src/enums/httpStatus.js";
import * as engine from "../src/services/matchingEngine.js";
import * as risk from "../src/services/riskRegistry.js";
import * as liveHub from "../src/services/liveHub.js";
import { LiveFeedClient, applyOrderBookDelta } from "../client/js/liveFeed.js";
import { renderAccountList, renderPortfolioSummary, renderRecentTrades } from "../client/js/dashboard.js";
import { netObligations, type Obligation } from "../src/domain/netting.js";
import { FeeEngine } from "../src/domain/fees.js";

// Integration: these scenarios only pass when the matching engine, the WebSocket hub, the live-feed client, the
// dashboard code, netting and fees all agree with each other, on a real server, with real sockets.

let testSession: Agent;
let market = 0;
const nextMarket = (): string => `INT-${(market += 1)}`;

beforeAll(async () => {
  testSession = testBase.createSuperTestSession(app);
  await testBase.resetDatabase(db);
});
afterEach(async () => {
  engine.resetAllBooks();
  risk.resetAll();
  await testBase.resetDatabase(db);
});
afterAll(async () => {
  await new Promise<void>((resolve, reject) => {
    app.close((err) => (err ? reject(err) : resolve()));
  });
});

const ACCOUNTS = ["int-alice", "int-bob", "int-carol", "int-dave"];
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

type Level = { price: string; quantity: string };
type Book = { bids: Level[]; asks: Level[] };
type Order = { account: number; side: "buy" | "sell"; price: number; quantity: number; cancel: boolean };

const orderArb = fc.record({
  account: fc.nat(ACCOUNTS.length - 1),
  side: fc.constantFrom<"buy" | "sell">("buy", "sell"),
  price: fc.integer({ min: 96, max: 104 }),
  quantity: fc.integer({ min: 1, max: 9 }),
  cancel: fc.boolean(),
});

async function place(mkt: string, order: Order): Promise<{ orderId: string | null; trades: { buyOrderId: string; sellOrderId: string; price: string; quantity: string }[] }> {
  const response = await testSession.post("/api/orders").send({ accountId: ACCOUNTS[order.account], market: mkt, side: order.side, price: String(order.price), quantity: String(order.quantity), timeInForce: "GTC" });
  expect(response.status, JSON.stringify(response.body)).toBe(HttpStatus.CREATED);
  return response.body.data;
}

async function runOrders(mkt: string, orders: Order[]): Promise<void> {
  const resting: string[] = [];
  for (const order of orders) {
    const result = await place(mkt, order);
    if (result.orderId) resting.push(result.orderId);
    if (order.cancel && resting.length > 0) {
      const target = resting.pop()!;
      const removal = await testSession.delete(`/api/orders/${target}`);
      expect([HttpStatus.OK, HttpStatus.NOT_FOUND]).toContain(removal.status);
    }
  }
}

async function depthOf(mkt: string): Promise<Book> {
  const response = await testSession.get(`/api/orders/book/${mkt}/depth`);
  return response.body.data as Book;
}

const canonical = (book: Book): Book => ({
  bids: [...book.bids].sort((a, b) => (BigInt(a.price) > BigInt(b.price) ? -1 : 1)),
  asks: [...book.asks].sort((a, b) => (BigInt(a.price) < BigInt(b.price) ? -1 : 1)),
});

function socketFactory(url: string) {
  const ws = new WebSocket(url);
  const adapter: { send: (d: string) => void; close: () => void; onopen: (() => void) | null; onmessage: ((e: { data: string }) => void) | null; onclose: (() => void) | null } = {
    send: (data) => ws.send(data),
    close: () => ws.close(),
    onopen: null,
    onmessage: null,
    onclose: null,
  };
  ws.on("open", () => adapter.onopen?.());
  ws.on("message", (data) => adapter.onmessage?.({ data: data.toString() }));
  ws.on("close", () => adapter.onclose?.());
  ws.on("error", () => undefined);
  return adapter;
}

async function liveBook(mkt: string, role: "operator" | "admin" = "operator") {
  const login = await testSession.post("/api/auth/login").send({ accountId: ACCOUNTS[0], role });
  expect(login.status).toBe(HttpStatus.OK);
  const port = (app.address() as AddressInfo).port;

  const state = { book: { bids: [], asks: [] } as Book, deltaSeqs: [] as number[], statuses: [] as string[], snapshots: 0 };
  const client = new LiveFeedClient({
    url: `ws://127.0.0.1:${port}/ws?token=${login.body.data.accessToken}`,
    topics: [`orderbook:${mkt}`],
    createSocket: socketFactory,
    setTimer: (fn: () => void, ms: number) => setTimeout(fn, ms) as unknown as number,
    clearTimer: (id: number) => clearTimeout(id),
    random: () => 0,
    staleAfterMs: 60_000,
    baseDelayMs: 20,
    maxDelayMs: 100,
    onStatus: (status: string) => state.statuses.push(status),
    onMessage: (_topic: string, message: { kind: string; seq: number; data: unknown }) => {
      if (message.kind === "snapshot") {
        state.book = message.data as Book;
        state.snapshots += 1;
      } else {
        state.book = applyOrderBookDelta(state.book, message.data as { side: string; price: string; quantity: string });
        state.deltaSeqs.push(message.seq);
      }
    },
  });
  client.start();
  const started = Date.now();
  while (state.snapshots === 0 && Date.now() - started < 3000) await sleep(10);
  expect(state.snapshots, "the feed never delivered its first snapshot").toBeGreaterThan(0);
  return { state, stop: () => client.stop() };
}

async function converge(mkt: string, state: { book: Book }): Promise<void> {
  const started = Date.now();
  let expected = canonical(await depthOf(mkt));
  while (JSON.stringify(canonical(state.book)) !== JSON.stringify(expected) && Date.now() - started < 4000) {
    await sleep(25);
    expected = canonical(await depthOf(mkt));
  }
  expect(canonical(state.book)).toEqual(expected);
}

describe("Challenge 21: Integration", () => {
  describe("Challenge 21a: The live order book", () => {
    test("Challenge 21a-1: the book rebuilt from the WebSocket feed always equals the depth endpoint, with a gapless sequence", async () => {
      await fc.assert(
        fc.asyncProperty(fc.array(orderArb, { minLength: 4, maxLength: 16 }), async (orders) => {
          const mkt = nextMarket();
          const live = await liveBook(mkt);
          await runOrders(mkt, orders);
          await converge(mkt, live.state);
          live.state.deltaSeqs.forEach((seq, i) => expect(seq).toBe(i + 1));
          live.stop();
        }),
        { numRuns: 5 },
      );
    });

    test("Challenge 21a-2: when the server drops every connection the client reconnects, resynchronises from a snapshot and catches up", async () => {
      const mkt = nextMarket();
      const live = await liveBook(mkt);
      const orders: Order[] = [
        { account: 0, side: "sell", price: 101, quantity: 5, cancel: false },
        { account: 1, side: "buy", price: 99, quantity: 4, cancel: false },
        { account: 2, side: "buy", price: 101, quantity: 2, cancel: false },
        { account: 3, side: "sell", price: 100, quantity: 7, cancel: false },
      ];
      await runOrders(mkt, orders);
      await converge(mkt, live.state);

      liveHub.disconnectAll();
      const started = Date.now();
      while (live.state.snapshots < 2 && Date.now() - started < 4000) await sleep(20);
      expect(live.state.snapshots).toBeGreaterThanOrEqual(2);
      expect(live.state.statuses).toContain("reconnecting");
      expect(live.state.statuses.at(-1)).toBe("live");

      await runOrders(mkt, [
        { account: 1, side: "buy", price: 100, quantity: 3, cancel: false },
        { account: 2, side: "sell", price: 98, quantity: 6, cancel: false },
      ]);
      await converge(mkt, live.state);
      live.stop();
    });
  });

  describe("Challenge 21b: From trades to settlement", () => {
    test("Challenge 21b-1: trades taken from the API net down without changing anyone's position, and their fees balance exactly", async () => {
      await fc.assert(
        fc.asyncProperty(fc.array(orderArb, { minLength: 8, maxLength: 24 }), async (orders) => {
          const mkt = nextMarket();
          engine.resetAllBooks();
          await runOrders(mkt, orders);

          const response = await testSession.get("/api/orders/trades").query({ limit: 50 });
          expect(response.status).toBe(HttpStatus.OK);
          const trades = (response.body.data as { market: string; buyAccountId: string | null; sellAccountId: string | null; takerSide: "buy" | "sell"; price: string; quantity: string }[]).filter((t) => t.market === mkt).reverse();

          const fees = new FeeEngine([{ minVolume: 0n, makerBps: 5n, takerBps: 10n }], { feeAccount: "clearhouse-fees", windowMs: 1_000_000 });
          const obligations: Obligation[] = [];
          const net = new Map<string, bigint>();
          let collected = 0n;
          const feeLines = new Map<string, bigint>();

          trades.forEach((trade, index) => {
            expect(trade.buyAccountId, "every trade must know its buyer").not.toBeNull();
            expect(trade.sellAccountId, "every trade must know its seller").not.toBeNull();
            expect(trade.buyAccountId).not.toBe(trade.sellAccountId);
            const notional = BigInt(trade.price) * BigInt(trade.quantity);
            obligations.push({ id: `t${index}`, from: trade.buyAccountId!, to: trade.sellAccountId!, asset: "USD", amount: notional });
            net.set(trade.buyAccountId!, (net.get(trade.buyAccountId!) ?? 0n) - notional);
            net.set(trade.sellAccountId!, (net.get(trade.sellAccountId!) ?? 0n) + notional);

            const takerAccount = trade.takerSide === "buy" ? trade.buyAccountId! : trade.sellAccountId!;
            const makerAccount = trade.takerSide === "buy" ? trade.sellAccountId! : trade.buyAccountId!;
            const result = fees.processFill({ fillId: `f${index}`, timestampMs: index, makerAccount, takerAccount, asset: "USD", notional });
            collected += result.makerFee + result.takerFee;
            for (const entry of result.entries) {
              expect(entry.lines.reduce((sum, line) => sum + line.amount, 0n)).toBe(0n);
              for (const line of entry.lines) feeLines.set(line.account, (feeLines.get(line.account) ?? 0n) + line.amount);
            }
          });

          expect([...net.values()].reduce((a, b) => a + b, 0n)).toBe(0n);
          expect(feeLines.get("clearhouse-fees") ?? 0n).toBe(collected);

          const transfers = netObligations(obligations);
          const flows = new Map<string, bigint>();
          for (const transfer of transfers) {
            flows.set(transfer.from, (flows.get(transfer.from) ?? 0n) - transfer.amount);
            flows.set(transfer.to, (flows.get(transfer.to) ?? 0n) + transfer.amount);
          }
          for (const [account, position] of net) expect(flows.get(account) ?? 0n).toBe(position);
          const nonZero = [...net.values()].filter((v) => v !== 0n).length;
          expect(transfers.length).toBeLessThanOrEqual(Math.max(0, nonZero - 1));
        }),
        { numRuns: 6 },
      );
    });
  });

  describe("Challenge 21c: The dashboard on real data", () => {
    test("Challenge 21c-1: after the demo seed and some trading, the dashboard's summary, account list and recent trades agree with the API and the database", async () => {
      await db.seed.run({ specific: "01_initial_accounts.ts" });
      const mkt = nextMarket();
      await runOrders(mkt, [
        { account: 0, side: "sell", price: 100, quantity: 5, cancel: false },
        { account: 1, side: "buy", price: 100, quantity: 3, cancel: false },
        { account: 2, side: "buy", price: 101, quantity: 4, cancel: false },
        { account: 3, side: "sell", price: 100, quantity: 6, cancel: false },
      ]);

      const [assets, accounts, trades] = await Promise.all([
        testSession.get("/api/assets").then((r) => r.body.data),
        testSession.get("/api/ledger/accounts").then((r) => r.body.data),
        testSession.get("/api/orders/trades").query({ limit: 10 }).then((r) => r.body.data),
      ]);
      expect((accounts as unknown[]).length).toBeGreaterThanOrEqual(6);

      const doc = new JSDOM(`<!doctype html><body><section id="accounts-view"></section><section id="summary-view"></section><section id="activity-view"></section></body>`).window.document;
      renderPortfolioSummary(doc, accounts, assets);
      renderAccountList(doc, accounts, assets);
      renderRecentTrades(doc, trades);

      const stored = (await db("account_balances").select("asset", "available", "held")) as { asset: string; available: string; held: string }[];
      const totals = new Map<string, bigint>();
      for (const row of stored) totals.set(row.asset, (totals.get(row.asset) ?? 0n) + BigInt(row.available) + BigInt(row.held));

      const cards = [...doc.querySelectorAll(".asset-total")];
      for (const card of cards) {
        const code = card.getAttribute("data-asset")!;
        const exponent = (assets as { code: string; exponent: number }[]).find((a) => a.code === code)!.exponent;
        const total = totals.get(code)!;
        const abs = total < 0n ? -total : total;
        const scale = 10n ** BigInt(exponent);
        const shown = (total < 0n ? "-" : "") + (exponent === 0 ? (abs / scale).toString() : `${abs / scale}.${(abs % scale).toString().padStart(exponent, "0")}`);
        expect(card.querySelector(".amount")?.textContent).toBe(shown);
      }
      expect(cards.length).toBe(totals.size);
      expect(doc.querySelectorAll("#accounts-view [data-account-id]").length).toBe((accounts as unknown[]).length);
      expect(doc.querySelectorAll("#activity-view [data-trade]").length).toBe(Math.min(10, (trades as unknown[]).length));
      expect((trades as unknown[]).length).toBeGreaterThan(0);
    });
  });
});
