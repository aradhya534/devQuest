import fc from "fast-check";
import crypto from "node:crypto";
import type { Agent } from "supertest";
import app from "../src/server.js";
import db from "../db/db-config.js";
import testBase from "./testBase.js";
import { expect, test, describe, beforeAll, afterAll, afterEach } from "vitest";
import HttpStatus from "../src/enums/httpStatus.js";
import { parseAmount, fromDecimal, add, sub, compare, divideWithRounding, Rounding, MoneyError } from "../src/domain/money.js";

// Computed independently of src/domain/signing.js on purpose: this test
// verifies the participant's *verification* path, so the signature it hands
// the server must not depend on the participant's own signing code also
// being correct — otherwise a consistently-wrong implementation of both
// sides could pass by agreeing with itself.
function independentSign({ method, path, rawBody, timestamp, nonce, secret }: { method: string; path: string; rawBody: string; timestamp: number; nonce: string; secret: string }): string {
  const bodyDigest = crypto.createHash("sha256").update(rawBody, "utf8").digest("hex");
  const message = [method.toUpperCase(), path, bodyDigest, timestamp, nonce].join("\n");
  return crypto.createHmac("sha256", secret).update(message, "utf8").digest("hex");
}

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

const HMAC_SECRET = process.env.HMAC_SECRET || "testOnlyDefaultHmacSecret";

interface SignedHeadersInput {
  method: string;
  path: string;
  rawBody: string;
  timestamp?: number;
  nonce?: string;
}

function signedHeaders({ method, path, rawBody, timestamp = Date.now(), nonce = `${Date.now()}-${Math.random()}` }: SignedHeadersInput): Record<string, string> {
  const signature = independentSign({ method, path, rawBody, timestamp, nonce, secret: HMAC_SECRET });
  return {
    "X-Signature": signature,
    "X-Timestamp": String(timestamp),
    "X-Nonce": nonce,
    "X-Algorithm": "HMAC-SHA256",
  };
}

describe("Challenge 01: Money, Assets and Authenticated Identity", () => {
  describe("Challenge 1a: Asset registry and strict amount parsing", () => {
    test("Challenge 1a-1: known assets round-trip through the minor-unit parser", () => {
      const cases: Array<[string, string]> = [
        ["0", "USD"],
        ["1", "JPY"],
        ["123", "BHD"],
        ["100000000", "BTC"],
      ];
      for (const [amount, asset] of cases) {
        const parsed = parseAmount(amount, asset);
        expect(parsed.amount.toString()).toBe(amount);
        expect(parsed.asset).toBe(asset);
      }
    });

    test("Challenge 1a-2: malformed amounts are rejected with 400, never silently coerced", async () => {
      const hostileAmounts = [
        "NaN",
        "Infinity",
        "-Infinity",
        "1e10",
        "+100",
        "01",
        "",
        "-1",
        "1.5",
        "9223372036854775808", // 2^63, one past the signed max
        "١٢٣", // Arabic-indic digits
      ];

      for (const amount of hostileAmounts) {
        const response = await testSession.post("/api/assets/validate").send({ amount, asset: "USD" });
        expect(response.status).toBe(HttpStatus.BAD_REQUEST);
        expect(response.body.error).toBeDefined();
      }
    });

    test("Challenge 1a-3: amounts supplied as JSON numbers are rejected, not coerced to strings", async () => {
      const response = await testSession.post("/api/assets/validate").send({ amount: 100, asset: "USD" });
      expect(response.status).toBe(HttpStatus.BAD_REQUEST);
    });

    test("Challenge 1a-4: decimal precision cannot exceed the asset's own exponent", () => {
      expect(() => fromDecimal("123.45", "USD")).not.toThrow();
      expect(() => fromDecimal("0.001", "USD")).toThrow(); // USD exponent is 2
      expect(() => fromDecimal("1", "JPY")).not.toThrow();
      expect(() => fromDecimal("1.5", "JPY")).toThrow(); // JPY exponent is 0
      expect(() => fromDecimal("0.00000001", "BTC")).not.toThrow(); // BTC exponent is 8
      expect(() => fromDecimal("0.000000001", "BTC")).toThrow();
    });

    test("Challenge 1a-5: property — parse and serialise round-trip for every asset and every valid integer", () => {
      fc.assert(
        fc.property(fc.constantFrom("USD", "JPY", "BHD", "BTC"), fc.bigInt({ min: 0n, max: 9223372036854775807n }), (asset, value) => {
          const parsed = parseAmount(value.toString(), asset);
          expect(parsed.amount).toBe(value);
        }),
      );
    });

    test("Challenge 1a-6: property — add/sub are inverses and asset-mismatch always throws", () => {
      fc.assert(
        fc.property(
          fc.constantFrom("USD", "JPY", "BHD", "BTC"),
          fc.bigInt({ min: 0n, max: 1_000_000_000n }),
          fc.bigInt({ min: 0n, max: 1_000_000_000n }),
          (asset, x, y) => {
            const a = { amount: x, asset };
            const b = { amount: y, asset };
            expect(sub(add(a, b), b)).toEqual(a);

            const other = { amount: y, asset: asset === "USD" ? "JPY" : "USD" };
            expect(() => add(a, other)).toThrow();
          },
        ),
      );
    });

    test("Challenge 1a-7: property — total order is antisymmetric and transitive", () => {
      fc.assert(
        fc.property(
          fc.bigInt({ min: -1_000_000n, max: 1_000_000n }),
          fc.bigInt({ min: -1_000_000n, max: 1_000_000n }),
          fc.bigInt({ min: -1_000_000n, max: 1_000_000n }),
          (x, y, z) => {
            const a = { amount: x, asset: "USD" };
            const b = { amount: y, asset: "USD" };
            const c = { amount: z, asset: "USD" };

            // Plain === rather than toBe/Object.is: compare() legitimately
            // returns 0 for equal amounts, and -0 === 0 even though they are
            // not Object.is-identical.
            expect(compare(a, b) === -compare(b, a)).toBe(true);
            if (compare(a, b) <= 0 && compare(b, c) <= 0) {
              expect(compare(a, c)).toBeLessThanOrEqual(0);
            }
          },
        ),
      );
    });
  });

  describe("Challenge 1b: Rounding conserves value", () => {
    test("Challenge 1b-1: half-even and half-up only disagree on an exact midpoint", () => {
      // 5 / 2 = 2.5, an exact midpoint: half-even rounds to the even neighbour (2),
      // half-up always rounds away from zero (3).
      expect(divideWithRounding(5n, 2n, Rounding.HALF_EVEN).quotient).toBe(2n);
      expect(divideWithRounding(5n, 2n, Rounding.HALF_UP).quotient).toBe(3n);
      // 7 / 2 = 3.5: even neighbour is 4.
      expect(divideWithRounding(7n, 2n, Rounding.HALF_EVEN).quotient).toBe(4n);
    });

    test("Challenge 1b-2: property — quotient * divisor + remainder reconstructs the dividend exactly", () => {
      fc.assert(
        fc.property(
          fc.bigInt({ min: -1_000_000_000n, max: 1_000_000_000n }),
          fc.bigInt({ min: 1n, max: 1_000_000n }),
          fc.constantFrom(Rounding.HALF_EVEN, Rounding.HALF_UP),
          (dividend, divisor, mode) => {
            const { quotient, remainder } = divideWithRounding(dividend, divisor, mode);
            expect(quotient * divisor + remainder).toBe(dividend);
            expect(remainder < divisor).toBe(true);
            expect(remainder > -divisor).toBe(true);
          },
        ),
      );
    });

    test("Challenge 1b-3: division by zero is rejected, never produces Infinity or NaN", () => {
      expect(() => divideWithRounding(100n, 0n)).toThrow(MoneyError);
      expect(divideWithRounding(100n, 4n).quotient).toBe(25n); // a real division still works
    });
  });

  describe("Challenge 1c: HMAC request signing", () => {
    test("Challenge 1c-1: a correctly signed request is accepted", async () => {
      const body = { hello: "world" };
      const rawBody = JSON.stringify(body);
      const headers = signedHeaders({ method: "POST", path: "/api/secure/echo", rawBody });

      const response = await testSession.post("/api/secure/echo").set(headers).send(body);
      expect(response.status).toBe(HttpStatus.OK);
      expect(response.body.data).toEqual(body);
    });

    test("Challenge 1c-2: a missing signature is rejected", async () => {
      // Control: a correctly signed request must get through, so rejecting everything cannot pass.
      const rawBody = JSON.stringify({ hello: "world" });
      const signed = await testSession.post("/api/secure/echo").set(signedHeaders({ method: "POST", path: "/api/secure/echo", rawBody })).send({ hello: "world" });
      expect(signed.status).toBe(HttpStatus.OK);

      const response = await testSession.post("/api/secure/echo").send({ hello: "world" });
      expect(response.status).toBe(HttpStatus.UNAUTHORIZED);
    });

    test("Challenge 1c-3: a signature computed over a different body is rejected", async () => {
      const signedBody = { hello: "world" };
      const headers = signedHeaders({ method: "POST", path: "/api/secure/echo", rawBody: JSON.stringify(signedBody) });

      // Send a different body than the one the signature covers.
      const response = await testSession.post("/api/secure/echo").set(headers).send({ hello: "tampered" });

      expect(response.status).toBe(HttpStatus.UNAUTHORIZED);
    });

    test("Challenge 1c-4: a timestamp outside the signing window is rejected", async () => {
      const body = { hello: "world" };
      const rawBody = JSON.stringify(body);
      const staleTimestamp = Date.now() - 60_000; // 60s old, window is 30s
      const headers = signedHeaders({ method: "POST", path: "/api/secure/echo", rawBody, timestamp: staleTimestamp });

      const response = await testSession.post("/api/secure/echo").set(headers).send(body);
      expect(response.status).toBe(HttpStatus.UNAUTHORIZED);
    });

    test("Challenge 1c-5: a replayed nonce is rejected on the second use", async () => {
      const body = { hello: "world" };
      const rawBody = JSON.stringify(body);
      const nonce = `replay-${Date.now()}`;
      const headers = signedHeaders({ method: "POST", path: "/api/secure/echo", rawBody, nonce });

      const first = await testSession.post("/api/secure/echo").set(headers).send(body);
      expect(first.status).toBe(HttpStatus.OK);

      const second = await testSession.post("/api/secure/echo").set(headers).send(body);
      expect(second.status).toBe(HttpStatus.UNAUTHORIZED);
    });

    test("Challenge 1c-6: an unrecognised algorithm is rejected even with an otherwise valid signature", async () => {
      const body = { hello: "world" };
      const rawBody = JSON.stringify(body);
      const headers = signedHeaders({ method: "POST", path: "/api/secure/echo", rawBody });
      headers["X-Algorithm"] = "HMAC-MD5";

      const response = await testSession.post("/api/secure/echo").set(headers).send(body);
      expect(response.status).toBe(HttpStatus.UNAUTHORIZED);
    });
  });

  describe("Challenge 1d: Authorization", () => {
    async function login(accountId: string, role: "operator" | "admin") {
      const response = await testSession.post("/api/auth/login").send({ accountId, role });
      return response.body.data as { accessToken: string; refreshToken: string };
    }

    test("Challenge 1d-1: an operator token is rejected on an admin-only route", async () => {
      const { accessToken } = await login("operator-acct", "operator");
      const response = await testSession.post("/api/risk/kill-switch").set("Authorization", `Bearer ${accessToken}`).send({ engaged: true });
      expect(response.status).toBe(HttpStatus.FORBIDDEN);
    });

    test("Challenge 1d-2: an admin-only route rejects a request with no token at all", async () => {
      // Control: the same route accepts an admin, so rejecting everyone cannot pass.
      const { accessToken } = await login("admin-acct", "admin");
      const allowed = await testSession.post("/api/risk/kill-switch").set("Authorization", `Bearer ${accessToken}`).send({ engaged: false });
      expect(allowed.status).toBe(HttpStatus.OK);

      const response = await testSession.post("/api/risk/kill-switch").send({ engaged: true });
      expect(response.status).toBe(HttpStatus.FORBIDDEN);
    });

    test("Challenge 1d-3: an admin token is accepted on an admin-only route", async () => {
      const { accessToken } = await login("admin-acct", "admin");
      const response = await testSession.post("/api/risk/kill-switch").set("Authorization", `Bearer ${accessToken}`).send({ engaged: false });
      expect(response.status).toBe(HttpStatus.OK);
    });

    test("Challenge 1d-4: a token acting on its own account's ledger balance succeeds", async () => {
      const account = await testSession.post("/api/ledger/accounts").send({ type: "asset", name: "owner" });
      const accountId = account.body.data.id as string;
      const { accessToken } = await login(accountId, "operator");

      const response = await testSession.get(`/api/ledger/accounts/${accountId}/balance`).query({ asset: "USD" }).set("Authorization", `Bearer ${accessToken}`);
      expect(response.status).toBe(HttpStatus.OK);
    });

    test("Challenge 1d-5: a valid token cannot read a different account's ledger balance", async () => {
      const accountA = await testSession.post("/api/ledger/accounts").send({ type: "asset", name: "owner-a" });
      const accountB = await testSession.post("/api/ledger/accounts").send({ type: "asset", name: "owner-b" });
      const accountAId = accountA.body.data.id as string;
      const accountBId = accountB.body.data.id as string;

      const { accessToken } = await login(accountAId, "operator");

      const response = await testSession.get(`/api/ledger/accounts/${accountBId}/balance`).query({ asset: "USD" }).set("Authorization", `Bearer ${accessToken}`);
      expect(response.status).toBe(HttpStatus.FORBIDDEN);
    });

    test("Challenge 1d-6: an anonymous request (no token at all) to a balance route is unaffected by tenant isolation", async () => {
      const account = await testSession.post("/api/ledger/accounts").send({ type: "asset", name: "anon-owner" });
      const accountId = account.body.data.id as string;

      const response = await testSession.get(`/api/ledger/accounts/${accountId}/balance`).query({ asset: "USD" });
      expect(response.status).toBe(HttpStatus.OK);
    });

    test("Challenge 1d-7: refreshing rotates the token, and the old refresh token is rejected on reuse", async () => {
      const { refreshToken } = await login("rotate-acct", "operator");

      const first = await testSession.post("/api/auth/refresh").send({ refreshToken });
      expect(first.status).toBe(HttpStatus.OK);
      expect(first.body.data.refreshToken).not.toBe(refreshToken);

      const replay = await testSession.post("/api/auth/refresh").send({ refreshToken });
      expect(replay.status).toBe(HttpStatus.UNAUTHORIZED);

      // Reuse invalidates the whole family — even the token issued by the
      // first, legitimate rotation must now be rejected too.
      const secondRotated = await testSession.post("/api/auth/refresh").send({ refreshToken: first.body.data.refreshToken });
      expect(secondRotated.status).toBe(HttpStatus.UNAUTHORIZED);
    });
  });
});
