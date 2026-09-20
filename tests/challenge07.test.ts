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

describe("Challenge 07: The Adversarial Gauntlet", () => {
  describe("Challenge 7a: Injection", () => {
    test("Challenge 7a-1: SQL metacharacters through every string field are treated as literal data, never executed", async () => {
      const hostileName = "widgets'; DROP TABLE accounts; --";
      const response = await testSession.post("/api/ledger/accounts").send({ type: "asset", name: hostileName });

      expect(response.status).toBe(HttpStatus.CREATED);
      expect(response.body.data.name).toBe(hostileName);

      // If the injection had executed, this would 500 with "no such table".
      const stillWorks = await testSession.post("/api/ledger/accounts").send({ type: "asset", name: "control" });
      expect(stillWorks.status).toBe(HttpStatus.CREATED);

      // The same hostile text through the settlement code you implement: as an asset, and as an idempotency key.
      const accountId = stillWorks.body.data.id as string;
      const hostile = await testSession.post("/api/settlement/deposits").set("Idempotency-Key", "x'; DROP TABLE account_balances; --").send({ accountId, asset: "USD'; DROP TABLE account_balances; --", amount: "100" });
      expect(hostile.status).toBeLessThan(500);

      // The tables must still exist and ordinary deposits must still work.
      const deposit = await testSession.post("/api/settlement/deposits").set("Idempotency-Key", "inj-control").send({ accountId, asset: "USD", amount: "100" });
      expect(deposit.status).toBe(HttpStatus.OK);
      const balance = await testSession.get(`/api/settlement/accounts/${accountId}/balance`).query({ asset: "USD" });
      expect(balance.body.data.available).toBe("100");
    });

    test("Challenge 7a-2: SQL metacharacters through a route parameter do not error and do not match a real account", async () => {
      const response = await testSession.get("/api/ledger/accounts/1' OR '1'='1/balance").query({ asset: "USD" });
      expect(response.status).toBe(HttpStatus.OK);
      expect(response.body.data.amount).toBe("0"); // no matching account, balance is the identity zero, not every account's total
    });
  });

  describe("Challenge 7b: Mass assignment", () => {
    test("Challenge 7b-1: unexpected privileged fields in a signup-shaped body are ignored, not applied", async () => {
      const response = await testSession.post("/api/ledger/accounts").send({
        type: "asset",
        name: "trader",
        id: "attacker-chosen-id",
        available: "999999999",
        role: "admin",
      });

      expect(response.status).toBe(HttpStatus.CREATED);
      expect(response.body.data.id).not.toBe("attacker-chosen-id");
      expect(response.body.data).not.toHaveProperty("role");

      // A deposit body that also names balance fields must apply only the amount.
      const accountId = response.body.data.id as string;
      const deposit = await testSession.post("/api/settlement/deposits").set("Idempotency-Key", "mass-1").send({ accountId, asset: "USD", amount: "100", held: "999", available: "999999", total: "1" });
      expect(deposit.status).toBe(HttpStatus.OK);
      const balance = await testSession.get(`/api/settlement/accounts/${accountId}/balance`).query({ asset: "USD" });
      expect(balance.body.data.available).toBe("100");
      expect(balance.body.data.held).toBe("0");
    });
  });

  describe("Challenge 7c: Prototype pollution", () => {
    test("Challenge 7c-1: a __proto__ key in the request body never reaches Object.prototype", async () => {
      const before = ({} as Record<string, unknown>).polluted;
      expect(before).toBeUndefined();

      const created = await testSession.post("/api/ledger/accounts").send(JSON.parse('{"type":"asset","name":"x","__proto__":{"polluted":"yes"}}'));
      const accountId = created.body.data.id as string;

      // The same key through the settlement code you implement — and the request must still succeed normally.
      const deposit = await testSession.post("/api/settlement/deposits").set("Idempotency-Key", "proto-1").send(JSON.parse(`{"accountId":"${accountId}","asset":"USD","amount":"100","__proto__":{"polluted":"yes"},"constructor":{"prototype":{"polluted":"yes"}}}`));
      expect(deposit.status).toBe(HttpStatus.OK);

      const after = ({} as Record<string, unknown>).polluted;
      expect(after).toBeUndefined();
    });
  });

  describe("Challenge 7d: Payload abuse", () => {
    test("Challenge 7d-1: an oversized body is rejected with 413, not a hang or a 500", async () => {
      const response = await testSession.post("/api/ledger/accounts").send({ type: "asset", name: "x".repeat(2_000_000) });
      expect(response.status).toBe(413);
    });

    test("Challenge 7d-2: a deeply nested body is rejected cleanly, not with a crash", async () => {
      let nested: unknown = "bottom";
      for (let i = 0; i < 1000; i += 1) nested = { next: nested };

      const response = await testSession.post("/api/ledger/accounts").send({ type: "asset", name: "x", nested });
      // Rejected outright (400, or 413 if the limit is size based) — not accepted and processed.
      expect([HttpStatus.BAD_REQUEST, 413]).toContain(response.status);
    });
  });

  describe("Challenge 7e: Security headers and disclosure", () => {
    test("Challenge 7e-1: responses carry baseline security headers and no framework fingerprint", async () => {
      const response = await testSession.get("/api/assets");
      expect(response.headers["x-content-type-options"]).toBe("nosniff");
      expect(response.headers["x-frame-options"]).toBe("DENY");
      expect(response.headers["x-powered-by"]).toBeUndefined();
    });

    test("Challenge 7e-2: an internal error never leaks a stack trace or a file path in the response body", async () => {
      const response = await testSession.post("/api/ledger/entries/not-a-real-id/reverse").send({});
      expect(response.status).toBeGreaterThanOrEqual(400);
      const raw = JSON.stringify(response.body);
      expect(raw).not.toMatch(/at .*\.ts:\d+/);
      expect(raw).not.toContain(process.cwd());
    });
  });
});
