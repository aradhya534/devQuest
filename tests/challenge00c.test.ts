import fc from "fast-check";
import type { Agent } from "supertest";
import type { Knex } from "knex";
import app from "../src/server.js";
import db from "../db/db-config.js";
import testBase from "./testBase.js";
import { expect, test, describe, beforeAll, afterAll, afterEach, vi } from "vitest";
import { getAsset, isKnownAsset, listAssets } from "../src/domain/assets.js";
import * as cache from "../src/services/cache.js";
import * as risk from "../src/services/riskRegistry.js";
import { readBalance, writeBalance, withIdempotency, IdempotencyConflictError } from "../src/repositories/settlementRepository.js";

let testSession: Agent;

beforeAll(async () => {
  testSession = testBase.createSuperTestSession(app);
  await testBase.resetDatabase(db);
});
afterEach(async () => {
  vi.useRealTimers();
  cache.clearAll();
  risk.resetAll();
  await testBase.resetDatabase(db);
});
afterAll(async () => {
  await new Promise<void>((resolve, reject) => {
    app.close((err) => (err ? reject(err) : resolve()));
  });
});

describe("Challenge 00: Infrastructure Bug Hunt", () => {
  describe("Challenge 0w: Concurrency", () => {
    test("Challenge 0w-1: requests sharing an idempotency key that arrive together run the operation once and agree on the result", async () => {
      let runs = 0;
      const operation = async () => {
        runs += 1;
        await new Promise((resolve) => setTimeout(resolve, 5));
        return { runs };
      };

      const results = await Promise.all(Array.from({ length: 6 }, () => withIdempotency(db, "race-key", { amount: "1" }, operation)));

      expect(runs).toBe(1);
      for (const result of results) expect(result).toEqual({ runs: 1 });
      await expect(withIdempotency(db, "race-key", { amount: "2" }, operation)).rejects.toBeInstanceOf(IdempotencyConflictError);
    });
  });

  describe("Challenge 0x: Asset registry", () => {
    test("Challenge 0x-1: changing an asset returned by the registry never changes the registry", () => {
      const copy = getAsset("USD");
      copy.exponent = 99;
      copy.name = "changed";
      listAssets()[0]!.exponent = 77;

      expect(getAsset("USD")).toEqual({ code: "USD", name: "US Dollar", exponent: 2 });
      expect(listAssets().find((asset) => asset.code === "USD")?.exponent).toBe(2);
    });

    test("Challenge 0x-2: property — an asset code is known exactly when it can be looked up", () => {
      fc.assert(
        fc.property(fc.constantFrom("USD", "usd", "Usd", "EUR", "eur", "JPY", "jpy", "BHD", "bhd", "BTC", "btc", "XXX", "", " USD"), (code) => {
          let found = true;
          try {
            getAsset(code);
          } catch {
            found = false;
          }
          expect(isKnownAsset(code)).toBe(found);
        }),
      );
    });
  });

  describe("Challenge 0y: Large balances", () => {
    test("Challenge 0y-1: balances beyond 2^53 are stored and read back exactly", async () => {
      const created = await testSession.post("/api/ledger/accounts").send({ type: "asset", name: "whale" });
      const accountId = created.body.data.id as string;
      const trx = db as unknown as Knex.Transaction;
      const available = 2n ** 62n + 1n;
      const held = 2n ** 60n + 3n;

      await writeBalance(trx, accountId, "BTC", { available, held });
      expect(await readBalance(trx, accountId, "BTC")).toEqual({ available, held });
    });
  });

  describe("Challenge 0z: Cleanup and shared state", () => {
    test("Challenge 0z-1: expired cache entries are removed when they are read, not kept forever", () => {
      vi.useFakeTimers();
      vi.setSystemTime(5_000_000);
      for (let i = 0; i < 50; i += 1) cache.set(`key-${i}`, i, 100);
      expect(cache.size()).toBe(50);

      vi.setSystemTime(5_000_500);
      for (let i = 0; i < 50; i += 1) expect(cache.get(`key-${i}`)).toBeUndefined();
      expect(cache.size()).toBe(0);
    });

    test("Challenge 0z-2: the risk state handed out for an account with no activity is private to the caller", () => {
      const first = risk.getState("fresh-account-1");
      first.openOrderCount = 7;
      first.committedExposure = 9n;

      expect(risk.getState("fresh-account-2")).toEqual({ openOrderCount: 0, committedExposure: 0n });
      expect(risk.getState("fresh-account-1")).toEqual({ openOrderCount: 0, committedExposure: 0n });
    });
  });
});
