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

describe("Challenge 11: API Design and Performance", () => {
  describe("Challenge 11a: Response envelope consistency", () => {
    test("Challenge 11a-1: a representative success response from every route family matches the { data, meta } envelope", async () => {
      const responses = await Promise.all([
        testSession.get("/api/assets"),
        testSession.get("/health"),
        testSession.post("/api/assets/validate").send({ amount: "100", asset: "USD" }),
        testSession.post("/api/ledger/accounts").send({ type: "asset", name: "envelope-test-account" }),
        testSession.get("/api/ledger/trial-balance"),
        testSession.get("/api/orders/book/ENVELOPE-MARKET"),
      ]);

      for (const response of responses) {
        expect(response.body).toHaveProperty("data");
        expect(response.body).toHaveProperty("meta");
      }
    });

    test("Challenge 11a-2: a representative error response from every route family matches the { error: { code, details } } envelope", async () => {
      const responses = await Promise.all([
        testSession.post("/api/assets/validate").send({ amount: 100, asset: "USD" }),
        testSession.post("/api/ledger/entries").send({ postings: [] }),
        testSession.post("/api/risk/limits").send({}),
      ]);

      for (const response of responses) {
        expect(response.body).toHaveProperty("error.code");
        expect(response.body).toHaveProperty("error.details");
      }
    });
  });

  describe("Challenge 11b: Cache correctness", () => {
    test("Challenge 11b-1: a first read is a cache miss and a second identical read is a cache hit", async () => {
      await testSession.put("/api/config/cache-test-key").send({ value: "v1" });

      const first = await testSession.get("/api/config/cache-test-key");
      expect(first.headers["x-cache"]).toBe("MISS");

      const second = await testSession.get("/api/config/cache-test-key");
      expect(second.headers["x-cache"]).toBe("HIT");
      expect(second.body.data.value).toBe("v1");
    });

    test("Challenge 11b-2: a write invalidates the cache — the very next read reflects it, not the stale value", async () => {
      await testSession.put("/api/config/cache-test-key-2").send({ value: "before" });
      await testSession.get("/api/config/cache-test-key-2"); // populate the cache

      await testSession.put("/api/config/cache-test-key-2").send({ value: "after" });

      const response = await testSession.get("/api/config/cache-test-key-2");
      expect(response.body.data.value).toBe("after");
      expect(response.headers["x-cache"]).toBe("MISS");
    });
  });

  describe("Challenge 11c: API versioning", () => {
    test("Challenge 11c-1: the same route answers identically under /api and /api/v1", async () => {
      const unversioned = await testSession.get("/api/assets");
      const versioned = await testSession.get("/api/v1/assets");

      expect(versioned.status).toBe(unversioned.status);
      expect(versioned.body).toEqual(unversioned.body);
    });

    test("Challenge 11c-2: an unknown version segment returns a clean 404, not a silent fallback", async () => {
      // Control: the known version answers, so a blanket 404 cannot pass.
      expect((await testSession.get("/api/v1/assets")).status).toBe(HttpStatus.OK);

      const response = await testSession.get("/api/v2/assets");
      expect(response.status).toBe(HttpStatus.NOT_FOUND);
      expect(response.body).toHaveProperty("error.code");
    });
  });

  describe("Challenge 11d: Latency budget", () => {
    test("Challenge 11d-1: a representative read-only route stays within a documented latency budget under repeated load", async () => {
      const LATENCY_BUDGET_MS = 200;
      const REQUEST_COUNT = 20;

      await testSession.get("/api/assets"); // warm-up — not measured, avoids charging cold-start/JIT cost to the budget

      const durations: number[] = [];
      for (let i = 0; i < REQUEST_COUNT; i += 1) {
        const startedAt = Date.now();
        const response = await testSession.get("/api/assets");
        durations.push(Date.now() - startedAt);
        expect(response.status).toBe(200);
      }

      const maxDuration = Math.max(...durations);
      expect(maxDuration).toBeLessThan(LATENCY_BUDGET_MS);
    });
  });
});
