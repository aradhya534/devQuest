import fs from "node:fs";
import crypto, { webcrypto } from "node:crypto";
import type { Agent } from "supertest";
import type { Knex } from "knex";
import { v4 as uuidv4 } from "uuid";
import app from "../src/server.js";
import db from "../db/db-config.js";
import testBase from "./testBase.js";
import { expect, test, describe, beforeAll, afterAll, afterEach, vi } from "vitest";
import HttpStatus from "../src/enums/httpStatus.js";
import { getAsset } from "../src/domain/assets.js";
import * as cache from "../src/services/cache.js";
import * as risk from "../src/services/riskRegistry.js";
import * as engine from "../src/services/matchingEngine.js";
import { readBalance, writeBalance, withIdempotency, IdempotencyConflictError } from "../src/repositories/settlementRepository.js";
import { assertOpen, AccountClosedError } from "../src/repositories/accountsRepository.js";
import { createHmacSigner } from "../client/js/signer.js";

let testSession: Agent;

beforeAll(async () => {
  testSession = testBase.createSuperTestSession(app);
  await testBase.resetDatabase(db);
});
afterEach(async () => {
  vi.useRealTimers();
  risk.resetAll();
  await testBase.resetDatabase(db);
});
afterAll(async () => {
  await new Promise<void>((resolve, reject) => {
    app.close((err) => (err ? reject(err) : resolve()));
  });
});

async function openAccount(name = "bug-hunt"): Promise<string> {
  const response = await testSession.post("/api/ledger/accounts").send({ type: "asset", name });
  return response.body.data.id as string;
}

describe("Challenge 00: Infrastructure Bug Hunt", () => {
  describe("Challenge 0g: HTTP status codes", () => {
    test("Challenge 0g-1: every status code the API uses has its standard value", () => {
      expect(HttpStatus.OK).toBe(200);
      expect(HttpStatus.CREATED).toBe(201);
      expect(HttpStatus.NOT_MODIFIED).toBe(304);
      expect(HttpStatus.BAD_REQUEST).toBe(400);
      expect(HttpStatus.NOT_FOUND).toBe(404);
      expect(HttpStatus.CONFLICT).toBe(409);
      expect(HttpStatus.PRECONDITION_FAILED).toBe(412);
      expect(HttpStatus.TOO_MANY_REQUESTS).toBe(429);
      expect(HttpStatus.INTERNAL_SERVER_ERROR).toBe(500);
      expect(HttpStatus.NOT_IMPLEMENTED).toBe(501);
      expect(HttpStatus.SERVICE_UNAVAILABLE).toBe(503);
    });
  });

  describe("Challenge 0h: Asset registry", () => {
    test("Challenge 0h-1: each asset has the exponent the specification gives it", () => {
      expect(getAsset("USD").exponent).toBe(2);
      expect(getAsset("EUR").exponent).toBe(2);
      expect(getAsset("JPY").exponent).toBe(0);
      expect(getAsset("BHD").exponent).toBe(3);
      expect(getAsset("BTC").exponent).toBe(8);
    });
  });

  describe("Challenge 0i: Response cache", () => {
    test("Challenge 0i-1: an entry lives for exactly its ttl in milliseconds and is gone afterwards", () => {
      vi.useFakeTimers();
      vi.setSystemTime(1_000_000);
      cache.set("ttl-key", "value", 100);

      vi.setSystemTime(1_000_099);
      expect(cache.get("ttl-key")).toBe("value");
      vi.setSystemTime(1_000_101);
      expect(cache.get("ttl-key")).toBeUndefined();
    });
  });

  describe("Challenge 0j: Risk registry", () => {
    test("Challenge 0j-1: an order's risk reservation can be taken exactly once", () => {
      risk.registerReservation("order-1", { accountId: "acct", side: "buy", quantity: 5n });
      expect(risk.takeReservation("order-1")).toMatchObject({ quantity: 5n });
      expect(risk.takeReservation("order-1")).toBeUndefined();
    });

    test("Challenge 0j-2: resetting the registry also disengages the kill switch", () => {
      risk.setKillSwitch(true);
      risk.resetAll();
      expect(risk.isKillSwitchEngaged()).toBe(false);
    });

    test("Challenge 0j-3: one account's limits never apply to another account", () => {
      const custom = { maxNotional: 5n, maxOpenOrders: 1, maxPositionAbs: 2n };
      risk.setLimits("account-a", custom);

      expect(risk.getLimits("account-a")).toEqual(custom);
      expect(risk.getLimits("account-b")).not.toEqual(custom);
      expect(risk.getLimits("account-b").maxOpenOrders).toBe(50);
    });
  });

  describe("Challenge 0k: Matching engine service", () => {
    test("Challenge 0k-1: cancelling an order id that was never placed reports not found", () => {
      expect(engine.cancel("never-placed")).toEqual({ found: false, cancelled: false });
    });

    test("Challenge 0k-2: an empty market has no best bid and no best ask, not a zero price", () => {
      expect(engine.bestPrices("EMPTY-MARKET")).toEqual({ bestBid: null, bestAsk: null });
    });
  });

  describe("Challenge 0l: Balances", () => {
    test("Challenge 0l-1: the balance endpoint reports total as available plus held", async () => {
      const accountId = await openAccount();
      await db("account_balances").insert({ account_id: accountId, asset: "USD", available: "70", held: "30" });

      const response = await testSession.get(`/api/settlement/accounts/${accountId}/balance`).query({ asset: "USD" });
      expect(response.status).toBe(HttpStatus.OK);
      expect(response.body.data).toMatchObject({ available: "70", held: "30", total: "100" });
    });

    test("Challenge 0l-2: the balance endpoint rejects a request that names no asset", async () => {
      const accountId = await openAccount();
      const response = await testSession.get(`/api/settlement/accounts/${accountId}/balance`);
      expect(response.status).toBe(HttpStatus.BAD_REQUEST);
    });

    test("Challenge 0l-3: updating an existing balance row writes both available and held", async () => {
      const accountId = await openAccount();
      const trx = db as unknown as Knex.Transaction;
      await writeBalance(trx, accountId, "USD", { available: 5n, held: 3n });
      await writeBalance(trx, accountId, "USD", { available: 4n, held: 9n });

      expect(await readBalance(trx, accountId, "USD")).toEqual({ available: 4n, held: 9n });
    });
  });

  describe("Challenge 0m: Idempotency", () => {
    test("Challenge 0m-1: reusing an idempotency key with a different body is a conflict, and with the same body replays the first result", async () => {
      let runs = 0;
      const operation = async () => {
        runs += 1;
        return { runs };
      };

      const first = await withIdempotency(db, "key-1", { amount: "1" }, operation);
      const replay = await withIdempotency(db, "key-1", { amount: "1" }, operation);
      expect(replay).toEqual(first);
      expect(runs).toBe(1);

      await expect(withIdempotency(db, "key-1", { amount: "2" }, operation)).rejects.toBeInstanceOf(IdempotencyConflictError);
    });
  });

  describe("Challenge 0n: Account status", () => {
    test("Challenge 0n-1: an account id that was never registered is not treated as closed, and a closed one is", async () => {
      await expect(assertOpen(db, "no-such-account")).resolves.toBeUndefined();

      const closedId = uuidv4();
      await db("accounts").insert({ id: closedId, type: "asset", name: "closed-one", status: "closed" });
      await expect(assertOpen(db, closedId)).rejects.toBeInstanceOf(AccountClosedError);
    });

    test("Challenge 0n-2: a newly created account is active", async () => {
      const accountId = await openAccount();
      const row = await db("accounts").where({ id: accountId }).first();
      expect(row.status).toBe("active");
    });
  });

  describe("Challenge 0o: Account creation", () => {
    test("Challenge 0o-1: an account with an unknown type is rejected", async () => {
      const response = await testSession.post("/api/ledger/accounts").send({ type: "bogus", name: "ok-name" });
      expect(response.status).toBe(HttpStatus.BAD_REQUEST);
    });

    test("Challenge 0o-2: an account with a blank name is rejected", async () => {
      const response = await testSession.post("/api/ledger/accounts").send({ type: "asset", name: "   " });
      expect(response.status).toBe(HttpStatus.BAD_REQUEST);
    });

    test("Challenge 0o-3: two accounts may share a name", async () => {
      const first = await testSession.post("/api/ledger/accounts").send({ type: "asset", name: "shared-name" });
      const second = await testSession.post("/api/ledger/accounts").send({ type: "asset", name: "shared-name" });
      expect(first.status).toBe(HttpStatus.CREATED);
      expect(second.status).toBe(HttpStatus.CREATED);
      expect(second.body.data.id).not.toBe(first.body.data.id);
    });
  });

  describe("Challenge 0p: Order validation", () => {
    test("Challenge 0p-1: an order with a zero quantity or a zero price is rejected before it reaches the engine", async () => {
      const zeroQuantity = await testSession.post("/api/orders").send({ accountId: "acct", market: "BUG-MARKET", side: "buy", price: "10", quantity: "0" });
      expect(zeroQuantity.status).toBe(HttpStatus.BAD_REQUEST);

      const zeroPrice = await testSession.post("/api/orders").send({ accountId: "acct", market: "BUG-MARKET", side: "buy", price: "0", quantity: "5" });
      expect(zeroPrice.status).toBe(HttpStatus.BAD_REQUEST);
    });
  });

  describe("Challenge 0q: Risk limits validation", () => {
    test("Challenge 0q-1: a negative or fractional open-order limit is rejected", async () => {
      const body = { accountId: "acct", maxNotional: "1000", maxPositionAbs: "1000" };
      const negative = await testSession.post("/api/risk/limits").send({ ...body, maxOpenOrders: -1 });
      expect(negative.status).toBe(HttpStatus.BAD_REQUEST);
      const fractional = await testSession.post("/api/risk/limits").send({ ...body, maxOpenOrders: 1.5 });
      expect(fractional.status).toBe(HttpStatus.BAD_REQUEST);
    });
  });

  describe("Challenge 0r: Market data input", () => {
    test("Challenge 0r-1: a trade with a non-numeric price or quantity is a 400, not a crash", async () => {
      const badPrice = await testSession.post("/api/market-data/candles").send({ resolutionMs: 60000, trades: [{ sequence: 1, price: "abc", quantity: "1", timestampMs: 0 }] });
      expect(badPrice.status).toBe(HttpStatus.BAD_REQUEST);
      const badQuantity = await testSession.post("/api/market-data/vwap").send({ trades: [{ sequence: 1, price: "10", quantity: "1.5", timestampMs: 0 }] });
      expect(badQuantity.status).toBe(HttpStatus.BAD_REQUEST);
    });
  });

  describe("Challenge 0s: Error handling", () => {
    test("Challenge 0s-1: a malformed JSON body is a 400 in the standard error envelope", async () => {
      const response = await testSession.post("/api/ledger/accounts").set("Content-Type", "application/json").send('{"type": "asset", "name": ');
      expect(response.status).toBe(HttpStatus.BAD_REQUEST);
      expect(response.body).toHaveProperty("error.code");
    });
  });

  describe("Challenge 0t: Dashboard request signing", () => {
    test("Challenge 0t-1: the dashboard signs a request exactly as the server verifies it", async () => {
      const secret = "dashboard-secret";
      const input = { method: "post", path: "/api/secure/echo", rawBody: JSON.stringify({ hello: "world" }), timestamp: 1_700_000_000_000, nonce: "nonce-123" };

      const bodyDigest = crypto.createHash("sha256").update(input.rawBody, "utf8").digest("hex");
      const message = [input.method.toUpperCase(), input.path, bodyDigest, String(input.timestamp), input.nonce].join("\n");
      const expected = crypto.createHmac("sha256", secret).update(message, "utf8").digest("hex");

      const signer = createHmacSigner(secret, webcrypto as unknown as Crypto);
      expect(await signer(input)).toBe(expected);
      // A request with no body signs the digest of the empty string.
      const empty = await signer({ method: "GET", path: "/api/assets", timestamp: 1, nonce: "n" });
      const emptyMessage = ["GET", "/api/assets", crypto.createHash("sha256").update("").digest("hex"), "1", "n"].join("\n");
      expect(empty).toBe(crypto.createHmac("sha256", secret).update(emptyMessage).digest("hex"));
    });
  });

  describe("Challenge 0u: Dashboard page wiring", () => {
    test("Challenge 0u-1: every element the dashboard script looks up exists in the page", () => {
      const html = fs.readFileSync("client/index.html", "utf8");
      const script = fs.readFileSync("client/js/app.js", "utf8");
      const ids = new Set<string>();
      for (const match of script.matchAll(/getElementById\("([^"]+)"\)/g)) ids.add(match[1]!);
      for (const match of script.matchAll(/setStatus\(document, "([^"]+)"/g)) ids.add(match[1]!);

      expect(ids.size).toBeGreaterThan(5);
      for (const id of ids) {
        expect(html.includes(`id="${id}"`), `index.html has no element with id "${id}"`).toBe(true);
      }
    });
  });

  describe("Challenge 0v: Project scripts", () => {
    test("Challenge 0v-1: the delete-db script removes the database file the application actually uses", () => {
      const pkg = JSON.parse(fs.readFileSync("package.json", "utf8")) as { scripts: Record<string, string> };
      const knexfile = fs.readFileSync("knexfile.js", "utf8");
      expect(knexfile).toContain("main.sqlite3");
      expect(pkg.scripts["delete-db"]).toMatch(/main\.sqlite3(\s|$)/);
    });
  });
});
