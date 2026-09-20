import fc from "fast-check";
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

describe("Challenge 02: The Double-Entry Ledger", () => {
  describe("Challenge 2a: Balance rule", () => {
    test("Challenge 2a-1: a balanced two-account entry is accepted", async () => {
      const cash = await openAccount("asset", "cash");
      const revenue = await openAccount("revenue", "sales");

      const response = await testSession.post("/api/ledger/entries").send({
        postings: [
          { accountId: cash, asset: "USD", amount: "1000" },
          { accountId: revenue, asset: "USD", amount: "-1000" },
        ],
      });

      expect(response.status).toBe(HttpStatus.CREATED);
    });

    test("Challenge 2a-2: an entry that does not sum to zero for its asset is rejected, and nothing is written", async () => {
      const cash = await openAccount("asset", "cash");
      const revenue = await openAccount("revenue", "sales");

      const response = await testSession.post("/api/ledger/entries").send({
        postings: [
          { accountId: cash, asset: "USD", amount: "1000" },
          { accountId: revenue, asset: "USD", amount: "-999" },
        ],
      });

      expect(response.status).toBe(422);

      const balance = await testSession.get(`/api/ledger/accounts/${cash}/balance`).query({ asset: "USD" });
      expect(balance.body.data.amount).toBe("0");
    });

    test("Challenge 2a-3: an entry mixing two assets must balance each one independently", async () => {
      const cash = await openAccount("asset", "cash");
      const revenue = await openAccount("revenue", "sales");

      const balanced = await testSession.post("/api/ledger/entries").send({
        postings: [
          { accountId: cash, asset: "USD", amount: "1000" },
          { accountId: revenue, asset: "USD", amount: "-1000" },
          { accountId: cash, asset: "EUR", amount: "500" },
          { accountId: revenue, asset: "EUR", amount: "-500" },
        ],
      });
      expect(balanced.status).toBe(HttpStatus.CREATED);

      const crossAsset = await testSession.post("/api/ledger/entries").send({
        postings: [
          { accountId: cash, asset: "USD", amount: "1000" },
          { accountId: revenue, asset: "EUR", amount: "-1000" },
        ],
      });
      expect(crossAsset.status).toBe(422);
    });

    test("Challenge 2a-4: property — a random balanced posting set is always accepted, and derived balances match the reference sum", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(fc.bigInt({ min: 1n, max: 1_000_000n }), { minLength: 2, maxLength: 6 }),
          async (magnitudes) => {
            const cash = await openAccount("asset", "cash");
            const revenue = await openAccount("revenue", "sales");
            const total = magnitudes.reduce((sum, m) => sum + m, 0n);

            const postings = [
              { accountId: cash, asset: "USD", amount: total.toString() },
              ...magnitudes.map((m) => ({ accountId: revenue, asset: "USD", amount: (-m).toString() })),
            ];

            const response = await testSession.post("/api/ledger/entries").send({ postings });
            expect(response.status).toBe(HttpStatus.CREATED);

            const balance = await testSession.get(`/api/ledger/accounts/${cash}/balance`).query({ asset: "USD" });
            expect(balance.body.data.amount).toBe(total.toString());
          },
        ),
        { numRuns: 15 },
      );
    });
  });

  describe("Challenge 2b: Append-only and reversal", () => {
    test("Challenge 2b-1: reversing an entry restores the pre-entry balance exactly", async () => {
      const cash = await openAccount("asset", "cash");
      const revenue = await openAccount("revenue", "sales");

      const entry = await testSession.post("/api/ledger/entries").send({
        postings: [
          { accountId: cash, asset: "USD", amount: "500" },
          { accountId: revenue, asset: "USD", amount: "-500" },
        ],
      });
      const entryId = entry.body.data.id as string;

      const reversal = await testSession.post(`/api/ledger/entries/${entryId}/reverse`).send({});
      expect(reversal.status).toBe(HttpStatus.CREATED);

      const balance = await testSession.get(`/api/ledger/accounts/${cash}/balance`).query({ asset: "USD" });
      expect(balance.body.data.amount).toBe("0");
    });

    test("Challenge 2b-2: the trial balance across all accounts sums to zero for every asset touched", async () => {
      const cash = await openAccount("asset", "cash");
      const revenue = await openAccount("revenue", "sales");
      const expense = await openAccount("expense", "fees");

      await testSession.post("/api/ledger/entries").send({
        postings: [
          { accountId: cash, asset: "USD", amount: "2000" },
          { accountId: revenue, asset: "USD", amount: "-2000" },
        ],
      });
      await testSession.post("/api/ledger/entries").send({
        postings: [
          { accountId: expense, asset: "USD", amount: "300" },
          { accountId: cash, asset: "USD", amount: "-300" },
        ],
      });

      const trial = await testSession.get("/api/ledger/trial-balance");
      expect(trial.body.data.balanced).toBe(true);
      expect(trial.body.data.byAsset.USD).toBe("0");
    });
  });

  describe("Challenge 2c: Point-in-time balances and statement pagination", () => {
    test("Challenge 2c-1: an as-of balance excludes entries posted after the cutoff entry", async () => {
      const cash = await openAccount("asset", "cash");
      const revenue = await openAccount("revenue", "sales");

      const first = await testSession.post("/api/ledger/entries").send({
        postings: [
          { accountId: cash, asset: "USD", amount: "100" },
          { accountId: revenue, asset: "USD", amount: "-100" },
        ],
      });
      const firstEntryId = first.body.data.id as string;

      await testSession.post("/api/ledger/entries").send({
        postings: [
          { accountId: cash, asset: "USD", amount: "50" },
          { accountId: revenue, asset: "USD", amount: "-50" },
        ],
      });

      const asOfFirst = await testSession.get(`/api/ledger/accounts/${cash}/balance`).query({ asset: "USD", asOfEntry: firstEntryId });
      expect(asOfFirst.body.data.amount).toBe("100");

      const current = await testSession.get(`/api/ledger/accounts/${cash}/balance`).query({ asset: "USD" });
      expect(current.body.data.amount).toBe("150");
    });

    test("Challenge 2c-2: concatenating every statement page yields each posting exactly once", async () => {
      const cash = await openAccount("asset", "cash");
      const revenue = await openAccount("revenue", "sales");

      for (let i = 0; i < 7; i += 1) {
        await testSession.post("/api/ledger/entries").send({
          postings: [
            { accountId: cash, asset: "USD", amount: "10" },
            { accountId: revenue, asset: "USD", amount: "-10" },
          ],
        });
      }

      const seenIds = new Set<string>();
      let cursor: string | undefined;
      let pages = 0;

      do {
        const query: Record<string, string> = { limit: "3" };
        if (cursor) query.cursor = cursor;
        const page = await testSession.get(`/api/ledger/accounts/${cash}/statement`).query(query);

        for (const posting of page.body.data) {
          expect(seenIds.has(posting.id)).toBe(false);
          seenIds.add(posting.id);
        }

        cursor = page.body.meta.nextCursor ?? undefined;
        pages += 1;
        expect(pages).toBeLessThan(20); // guards against an infinite loop on a cursor bug
      } while (cursor);

      expect(seenIds.size).toBe(7);
    });
  });
});
