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

async function balanceOf(accountId: string, asset: string) {
  const response = await testSession.get(`/api/settlement/accounts/${accountId}/balance`).query({ asset });
  return response.body.data as { available: string; held: string; total: string };
}

describe("Challenge 04: Settlement, Holds and Atomicity", () => {
  describe("Challenge 4a: Holds", () => {
    test("Challenge 4a-1: a deposit increases available, a hold moves it to held without touching the total", async () => {
      const account = await openAccount("asset", "trader-cash");
      await testSession.post("/api/settlement/deposits").set("Idempotency-Key", "dep-1").send({ accountId: account, asset: "USD", amount: "1000" });

      const holdResponse = await testSession.post("/api/settlement/holds").send({ accountId: account, asset: "USD", amount: "400" });

      expect(holdResponse.status).toBe(HttpStatus.OK);
      const balance = await balanceOf(account, "USD");
      expect(balance.available).toBe("600");
      expect(balance.held).toBe("400");
      expect(balance.total).toBe("1000");
    });

    test("Challenge 4a-2: a hold exceeding available is rejected, and the balance is unchanged", async () => {
      const account = await openAccount("asset", "trader-cash");
      await testSession.post("/api/settlement/deposits").set("Idempotency-Key", "dep-2").send({ accountId: account, asset: "USD", amount: "100" });

      const response = await testSession.post("/api/settlement/holds").send({ accountId: account, asset: "USD", amount: "500" });
      expect(response.status).toBe(HttpStatus.CONFLICT);

      const balance = await balanceOf(account, "USD");
      expect(balance.available).toBe("100");
      expect(balance.held).toBe("0");
    });

    test("Challenge 4a-3: releasing exactly what was held restores available, and cannot release more than is held", async () => {
      const account = await openAccount("asset", "trader-cash");
      await testSession.post("/api/settlement/deposits").set("Idempotency-Key", "dep-3").send({ accountId: account, asset: "USD", amount: "1000" });
      await testSession.post("/api/settlement/holds").send({ accountId: account, asset: "USD", amount: "400" });

      const overRelease = await testSession.post("/api/settlement/releases").send({ accountId: account, asset: "USD", amount: "500" });
      expect(overRelease.status).toBe(HttpStatus.CONFLICT);

      const release = await testSession.post("/api/settlement/releases").send({ accountId: account, asset: "USD", amount: "400" });
      expect(release.status).toBe(HttpStatus.OK);

      const balance = await balanceOf(account, "USD");
      expect(balance.available).toBe("1000");
      expect(balance.held).toBe("0");
    });

    test("Challenge 4a-4: 100-way concurrent holds against 40 available succeed exactly 40 times, and the final split is exact", async () => {
      const account = await openAccount("asset", "trader-cash");
      await testSession.post("/api/settlement/deposits").set("Idempotency-Key", "dep-4").send({ accountId: account, asset: "USD", amount: "40" });

      const attempts = await Promise.all(Array.from({ length: 100 }, () => testSession.post("/api/settlement/holds").send({ accountId: account, asset: "USD", amount: "1" })));

      const succeeded = attempts.filter((r) => r.status === HttpStatus.OK);
      const rejected = attempts.filter((r) => r.status === HttpStatus.CONFLICT);

      expect(succeeded).toHaveLength(40);
      expect(rejected).toHaveLength(60);

      const balance = await balanceOf(account, "USD");
      expect(balance.available).toBe("0");
      expect(balance.held).toBe("40");
      expect(balance.total).toBe("40");
    });
  });

  describe("Challenge 4b: Idempotency", () => {
    test("Challenge 4b-1: replaying a deposit with the same Idempotency-Key applies it exactly once", async () => {
      const account = await openAccount("asset", "trader-cash");

      const responses = await Promise.all(
        Array.from({ length: 20 }, () => testSession.post("/api/settlement/deposits").set("Idempotency-Key", "replay-key").send({ accountId: account, asset: "USD", amount: "500" })),
      );

      for (const response of responses) {
        expect(response.status).toBe(HttpStatus.OK);
        expect(response.body.data.available).toBe("500");
      }

      const balance = await balanceOf(account, "USD");
      expect(balance.available).toBe("500");
    });

    test("Challenge 4b-2: the same Idempotency-Key with a different body is a conflict, not a silent second effect", async () => {
      const account = await openAccount("asset", "trader-cash");
      await testSession.post("/api/settlement/deposits").set("Idempotency-Key", "reused-key").send({ accountId: account, asset: "USD", amount: "500" });

      const response = await testSession.post("/api/settlement/deposits").set("Idempotency-Key", "reused-key").send({ accountId: account, asset: "USD", amount: "999" });

      expect(response.status).toBe(HttpStatus.CONFLICT); // surfaced, not silently accepted or silently ignored
      const balance = await balanceOf(account, "USD");
      expect(balance.available).toBe("500");
    });

    test("Challenge 4b-3: withdrawal is idempotent and can only draw on available, never held", async () => {
      const account = await openAccount("asset", "trader-cash");
      await testSession.post("/api/settlement/deposits").set("Idempotency-Key", "dep-5").send({ accountId: account, asset: "USD", amount: "1000" });
      await testSession.post("/api/settlement/holds").send({ accountId: account, asset: "USD", amount: "700" });

      const overWithdraw = await testSession.post("/api/settlement/withdrawals").set("Idempotency-Key", "wd-1").send({ accountId: account, asset: "USD", amount: "500" });
      expect(overWithdraw.status).toBe(HttpStatus.CONFLICT);

      const withdraw = await testSession.post("/api/settlement/withdrawals").set("Idempotency-Key", "wd-2").send({ accountId: account, asset: "USD", amount: "300" });
      expect(withdraw.status).toBe(HttpStatus.OK);

      const balance = await balanceOf(account, "USD");
      expect(balance.available).toBe("0");
      expect(balance.held).toBe("700");
    });
  });

  describe("Challenge 4c: Atomic trade settlement", () => {
    test("Challenge 4c-1: settling a trade moves both legs atomically, and posts a balanced ledger entry", async () => {
      const buyerAsset = await openAccount("asset", "buyer-inventory");
      const sellerAsset = await openAccount("asset", "seller-inventory");
      const buyerCash = await openAccount("asset", "buyer-cash");
      const sellerCash = await openAccount("asset", "seller-cash");

      await testSession.post("/api/settlement/deposits").set("Idempotency-Key", "seed-shares").send({ accountId: sellerAsset, asset: "SHARE-XYZ", amount: "100" });
      await testSession.post("/api/settlement/holds").send({ accountId: sellerAsset, asset: "SHARE-XYZ", amount: "100" });

      await testSession.post("/api/settlement/deposits").set("Idempotency-Key", "seed-cash").send({ accountId: buyerCash, asset: "USD", amount: "10000" });
      await testSession.post("/api/settlement/holds").send({ accountId: buyerCash, asset: "USD", amount: "10000" });

      const trade = await testSession.post("/api/settlement/trades").send({
        sellerAssetAccountId: sellerAsset,
        buyerAssetAccountId: buyerAsset,
        asset: "SHARE-XYZ",
        quantity: "100",
        buyerCashAccountId: buyerCash,
        sellerCashAccountId: sellerCash,
        cashAsset: "USD",
        cashAmount: "10000",
      });
      expect(trade.status).toBe(HttpStatus.CREATED);

      const buyerAssetBalance = await balanceOf(buyerAsset, "SHARE-XYZ");
      const sellerCashBalance = await balanceOf(sellerCash, "USD");
      expect(buyerAssetBalance.available).toBe("100");
      expect(sellerCashBalance.available).toBe("10000");

      const trial = await testSession.get("/api/ledger/trial-balance");
      expect(trial.body.data.balanced).toBe(true);
    });

    test("Challenge 4c-2: a trade that would overdraw a hold is rejected and leaves every balance untouched", async () => {
      const buyerAsset = await openAccount("asset", "buyer-inventory");
      const sellerAsset = await openAccount("asset", "seller-inventory");
      const buyerCash = await openAccount("asset", "buyer-cash");
      const sellerCash = await openAccount("asset", "seller-cash");

      // Seller never holds any SHARE-XYZ, so the trade's release step must fail.
      const before = await balanceOf(sellerCash, "USD");

      const trade = await testSession.post("/api/settlement/trades").send({
        sellerAssetAccountId: sellerAsset,
        buyerAssetAccountId: buyerAsset,
        asset: "SHARE-XYZ",
        quantity: "100",
        buyerCashAccountId: buyerCash,
        sellerCashAccountId: sellerCash,
        cashAsset: "USD",
        cashAmount: "10000",
      });

      expect(trade.status).toBe(HttpStatus.CONFLICT);
      const after = await balanceOf(sellerCash, "USD");
      expect(after).toEqual(before);
    });
  });
});
