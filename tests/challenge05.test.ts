import type { Agent } from "supertest";
import app from "../src/server.js";
import db from "../db/db-config.js";
import testBase from "./testBase.js";
import { expect, test, describe, beforeAll, afterAll, beforeEach } from "vitest";
import HttpStatus from "../src/enums/httpStatus.js";
import { resetAllBooks } from "../src/services/matchingEngine.js";
import { resetAll as resetRisk } from "../src/services/riskRegistry.js";

let testSession: Agent;
let marketCounter = 0;

beforeAll(async () => {
  testSession = testBase.createSuperTestSession(app);
  await testBase.resetDatabase(db);
});
beforeEach(() => {
  resetAllBooks();
  resetRisk();
  marketCounter += 1;
});
afterAll(async () => {
  await new Promise<void>((resolve, reject) => {
    app.close((err) => (err ? reject(err) : resolve()));
  });
});

function market(): string {
  return `RISK-${marketCounter}`;
}

async function setLimits(accountId: string, overrides: Partial<{ maxNotional: string; maxOpenOrders: number; maxPositionAbs: string }> = {}) {
  return testSession.post("/api/risk/limits").send({
    accountId,
    maxNotional: "1000000",
    maxOpenOrders: 10,
    maxPositionAbs: "100",
    ...overrides,
  });
}

async function place(m: string, order: { accountId: string; side: "buy" | "sell"; price?: string; quantity: string }) {
  return testSession.post("/api/orders").send({ market: m, ...order });
}

describe("Challenge 05: Pre-Trade Risk and Limits", () => {
  describe("Challenge 5a: Individual rules", () => {
    test("Challenge 5a-1: an order whose notional exceeds the account's limit is rejected before it ever reaches the book", async () => {
      const account = "trader-a";
      await setLimits(account, { maxNotional: "500" });

      const response = await place(market(), { accountId: account, side: "buy", price: "100", quantity: "10" }); // notional 1000 > 500

      expect(response.status).toBe(HttpStatus.CONFLICT);
      expect(response.body.error.code).toBe("MAX_NOTIONAL");
    });

    test("Challenge 5a-2: an account cannot have more resting orders open than its limit", async () => {
      const account = "trader-b";
      const m = market();
      await setLimits(account, { maxOpenOrders: 2 });

      await place(m, { accountId: account, side: "buy", price: "10", quantity: "1" });
      await place(m, { accountId: account, side: "buy", price: "11", quantity: "1" });
      const third = await place(m, { accountId: account, side: "buy", price: "12", quantity: "1" });

      expect(third.status).toBe(HttpStatus.CONFLICT);
      expect(third.body.error.code).toBe("MAX_OPEN_ORDERS");
    });

    test("Challenge 5a-3: committed exposure beyond the position limit is rejected", async () => {
      const account = "trader-c";
      await setLimits(account, { maxPositionAbs: "50" });

      const response = await place(market(), { accountId: account, side: "buy", price: "10", quantity: "60" });

      expect(response.status).toBe(HttpStatus.CONFLICT);
      expect(response.body.error.code).toBe("MAX_POSITION");
    });

    test("Challenge 5a-4: cancelling a resting order releases both its open-order slot and its exposure", async () => {
      const account = "trader-d";
      const m = market();
      await setLimits(account, { maxOpenOrders: 1, maxPositionAbs: "10" });

      const first = await place(m, { accountId: account, side: "buy", price: "10", quantity: "10" });
      const blocked = await place(m, { accountId: account, side: "buy", price: "11", quantity: "1" });
      expect(blocked.status).toBe(HttpStatus.CONFLICT);

      await testSession.delete(`/api/orders/${first.body.data.orderId}`);

      const afterCancel = await place(m, { accountId: account, side: "buy", price: "11", quantity: "1" });
      expect(afterCancel.status).toBe(HttpStatus.CREATED);

      const state = await testSession.get(`/api/risk/accounts/${account}/state`);
      expect(state.body.data.openOrderCount).toBe(1);
    });
  });

  describe("Challenge 5b: Deterministic precedence", () => {
    test("Challenge 5b-1: when an order violates both the notional and the open-order limit, the notional violation is reported", async () => {
      const account = "trader-e";
      const m = market();
      await setLimits(account, { maxNotional: "50", maxOpenOrders: 0 });

      const response = await place(m, { accountId: account, side: "buy", price: "10", quantity: "10" }); // notional 100 > 50, and open orders 0 already at cap

      expect(response.body.error.code).toBe("MAX_NOTIONAL");
    });
  });

  describe("Challenge 5c: Concurrent joint-limit enforcement", () => {
    test("Challenge 5c-1: of two orders each individually within the position limit but jointly over it, submitted in parallel, exactly one is accepted", async () => {
      const account = "trader-f";
      const m = market();
      await setLimits(account, { maxPositionAbs: "100" });

      const [first, second] = await Promise.all([place(m, { accountId: account, side: "buy", price: "10", quantity: "60" }), place(m, { accountId: account, side: "buy", price: "10", quantity: "60" })]);

      const statuses = [first.status, second.status].sort((a, b) => a - b);
      expect(statuses).toEqual([HttpStatus.CREATED, HttpStatus.CONFLICT]);

      const state = await testSession.get(`/api/risk/accounts/${account}/state`);
      expect(state.body.data.committedExposure).toBe("60");
    });
  });

  describe("Challenge 5d: Kill switch", () => {
    test("Challenge 5d-1: once engaged, new orders are rejected but cancellation still works", async () => {
      const account = "trader-g";
      const m = market();
      await setLimits(account);

      const login = await testSession.post("/api/auth/login").send({ accountId: "risk-admin", role: "admin" });
      const adminToken = login.body.data.accessToken as string;

      const resting = await place(m, { accountId: account, side: "buy", price: "10", quantity: "1" });

      await testSession.post("/api/risk/kill-switch").set("Authorization", `Bearer ${adminToken}`).send({ engaged: true });

      const rejected = await place(m, { accountId: account, side: "buy", price: "10", quantity: "1" });
      expect(rejected.status).toBe(HttpStatus.CONFLICT);
      expect(rejected.body.error.code).toBe("KILL_SWITCH_ENGAGED");

      const cancel = await testSession.delete(`/api/orders/${resting.body.data.orderId}`);
      expect(cancel.status).toBe(HttpStatus.OK);

      await testSession.post("/api/risk/kill-switch").set("Authorization", `Bearer ${adminToken}`).send({ engaged: false });
    });
  });
});
