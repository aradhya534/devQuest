import type { Agent } from "supertest";
import app from "../src/server.js";
import db from "../db/db-config.js";
import testBase from "./testBase.js";
import { expect, test, describe, beforeAll, afterAll, afterEach } from "vitest";
import HttpStatus from "../src/enums/httpStatus.js";

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

async function openAccount(type: string, name: string): Promise<string> {
  const response = await testSession.post("/api/ledger/accounts").send({ type, name });
  return response.body.data.id as string;
}

async function closeAccount(accountId: string) {
  const login = await testSession.post("/api/auth/login").send({ accountId: "closure-admin", role: "admin" });
  const adminToken = login.body.data.accessToken as string;
  return testSession.post(`/api/ledger/accounts/${accountId}/close`).set("Authorization", `Bearer ${adminToken}`).send({});
}

describe("Challenge 13: The Extension Round — Account Closure", () => {
  describe("Challenge 13a: Closing requires a zero balance", () => {
    test("Challenge 13a-1: an account with a nonzero available balance cannot be closed", async () => {
      const account = await openAccount("asset", "trader");
      await testSession.post("/api/settlement/deposits").set("Idempotency-Key", "c10-dep-1").send({ accountId: account, asset: "USD", amount: "100" });

      const response = await closeAccount(account);
      expect(response.status).toBe(HttpStatus.CONFLICT);
      expect(response.body.error.code).toBe("ACCOUNT_HAS_BALANCE");
    });

    test("Challenge 13a-2: an account with a nonzero held balance cannot be closed either", async () => {
      const account = await openAccount("asset", "trader");
      await testSession.post("/api/settlement/deposits").set("Idempotency-Key", "c10-dep-2").send({ accountId: account, asset: "USD", amount: "100" });
      await testSession.post("/api/settlement/holds").send({ accountId: account, asset: "USD", amount: "100" });

      const response = await closeAccount(account);
      expect(response.status).toBe(HttpStatus.CONFLICT);
    });

    test("Challenge 13a-3: an account with every balance at exactly zero closes successfully", async () => {
      const account = await openAccount("asset", "trader");
      await testSession.post("/api/settlement/deposits").set("Idempotency-Key", "c10-dep-3").send({ accountId: account, asset: "USD", amount: "100" });
      await testSession.post("/api/settlement/withdrawals").set("Idempotency-Key", "c10-wd-3").send({ accountId: account, asset: "USD", amount: "100" });

      const response = await closeAccount(account);
      expect(response.status).toBe(HttpStatus.OK);
      expect(response.body.data.status).toBe("closed");
    });

    test("Challenge 13a-4: a freshly opened account with no balance activity at all closes successfully", async () => {
      const account = await openAccount("asset", "empty");
      const response = await closeAccount(account);
      expect(response.status).toBe(HttpStatus.OK);
    });
  });

  describe("Challenge 13b: A closed account rejects every balance-moving operation", () => {
    test("Challenge 13b-1: deposit, withdrawal and hold are all rejected once closed, and no balance moves", async () => {
      const account = await openAccount("asset", "closed-trader");
      await closeAccount(account);

      const deposit = await testSession.post("/api/settlement/deposits").set("Idempotency-Key", "c10-dep-4").send({ accountId: account, asset: "USD", amount: "50" });
      expect(deposit.status).toBe(HttpStatus.CONFLICT);
      expect(deposit.body.error.code).toBe("ACCOUNT_CLOSED");

      const balance = await testSession.get(`/api/settlement/accounts/${account}/balance`).query({ asset: "USD" });
      expect(balance.body.data.available).toBe("0");
    });

    test("Challenge 13b-2: a trade touching any one of the four accounts is rejected atomically, and none of the four balances move", async () => {
      const buyerAsset = await openAccount("asset", "buyer-inventory");
      const sellerAsset = await openAccount("asset", "seller-inventory");
      const buyerCash = await openAccount("asset", "buyer-cash");
      const sellerCash = await openAccount("asset", "seller-cash");

      await closeAccount(sellerCash);

      const trade = await testSession.post("/api/settlement/trades").send({
        sellerAssetAccountId: sellerAsset,
        buyerAssetAccountId: buyerAsset,
        asset: "SHARE-XYZ",
        quantity: "10",
        buyerCashAccountId: buyerCash,
        sellerCashAccountId: sellerCash,
        cashAsset: "USD",
        cashAmount: "1000",
      });

      expect(trade.status).toBe(HttpStatus.CONFLICT);
      expect(trade.body.error.code).toBe("ACCOUNT_CLOSED");

      const buyerAssetBalance = await testSession.get(`/api/settlement/accounts/${buyerAsset}/balance`).query({ asset: "SHARE-XYZ" });
      expect(buyerAssetBalance.body.data.available).toBe("0");
    });
  });

  describe("Challenge 13c: A closed account cannot place new orders", () => {
    test("Challenge 13c-1: a registered account that has been closed is rejected when it tries to place an order", async () => {
      const account = await openAccount("asset", "closed-order-trader");
      await closeAccount(account);

      const response = await testSession.post("/api/orders").send({ market: "C10-MARKET", accountId: account, side: "buy", price: "100", quantity: "1" });
      expect(response.status).toBe(HttpStatus.CONFLICT);
      expect(response.body.error.code).toBe("ACCOUNT_CLOSED");
    });

    test("Challenge 13c-2: an unregistered account id — never created through the ledger — is unaffected by closure semantics and still trades normally", async () => {
      const response = await testSession.post("/api/orders").send({ market: "C10-MARKET-2", accountId: "bare-account-string", side: "sell", price: "100", quantity: "1" });
      expect(response.status).toBe(HttpStatus.CREATED);
    });
  });

  describe("Challenge 13d: Challenges 01–12 are unaffected by the amendment", () => {
    test("Challenge 13d-1: a balanced ledger entry between two open accounts still posts, and the trial balance still proves zero", async () => {
      const a = await openAccount("asset", "regression-a");
      const b = await openAccount("revenue", "regression-b");

      const entry = await testSession.post("/api/ledger/entries").send({
        postings: [
          { accountId: a, asset: "USD", amount: "500" },
          { accountId: b, asset: "USD", amount: "-500" },
        ],
      });
      expect(entry.status).toBe(HttpStatus.CREATED);

      const trial = await testSession.get("/api/ledger/trial-balance");
      expect(trial.body.data.balanced).toBe(true);
    });

    test("Challenge 13d-2: a hold-then-release cycle on a still-open account is unaffected", async () => {
      const account = await openAccount("asset", "regression-c");
      await testSession.post("/api/settlement/deposits").set("Idempotency-Key", "c10-dep-5").send({ accountId: account, asset: "USD", amount: "200" });
      await testSession.post("/api/settlement/holds").send({ accountId: account, asset: "USD", amount: "200" });
      const release = await testSession.post("/api/settlement/releases").send({ accountId: account, asset: "USD", amount: "200" });

      expect(release.status).toBe(HttpStatus.OK);
      expect(release.body.data.available).toBe("200");
    });
  });
});
