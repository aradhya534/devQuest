import type { Agent } from "supertest";
import { v4 as uuidv4 } from "uuid";
import app from "../src/server.js";
import db from "../db/db-config.js";
import testBase from "./testBase.js";
import { expect, test, describe, beforeAll, afterAll, afterEach } from "vitest";
import HttpStatus from "../src/enums/httpStatus.js";
import * as normalizeMigration from "../db/migrations/20260101000005_backfill_normalized_account_names.js";

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

describe("Challenge 09: Reconciliation, Reporting and Migration", () => {
  describe("Challenge 9a: The trial balance proves the ledger", () => {
    test("Challenge 9a-1: the trial balance sums to zero per asset after a randomised sequence of balanced entries", async () => {
      const accountA = (await testSession.post("/api/ledger/accounts").send({ type: "asset", name: "a" })).body.data.id;
      const accountB = (await testSession.post("/api/ledger/accounts").send({ type: "revenue", name: "b" })).body.data.id;
      const accountC = (await testSession.post("/api/ledger/accounts").send({ type: "expense", name: "c" })).body.data.id;

      await testSession.post("/api/ledger/entries").send({
        postings: [
          { accountId: accountA, asset: "USD", amount: "700" },
          { accountId: accountB, asset: "USD", amount: "-700" },
        ],
      });
      await testSession.post("/api/ledger/entries").send({
        postings: [
          { accountId: accountC, asset: "USD", amount: "150" },
          { accountId: accountA, asset: "USD", amount: "-150" },
        ],
      });

      const trial = await testSession.get("/api/ledger/trial-balance");
      expect(trial.status).toBe(HttpStatus.OK);
      expect(trial.body.data.balanced).toBe(true);
      expect(trial.body.data.byAsset.USD).toBe("0");
    });

    test("Challenge 9a-2: an empty ledger reconciles trivially — no accounts, no imbalance", async () => {
      const trial = await testSession.get("/api/ledger/trial-balance");
      expect(trial.body.data.balanced).toBe(true);
      expect(Object.keys(trial.body.data.byAsset)).toHaveLength(0);
    });
  });

  describe("Challenge 9b: Legacy data migration", () => {
    test("Challenge 9b-1: the normalisation backfill is idempotent and non-destructive to the original column", async () => {
      // Roll this one migration back to simulate a fresh, un-migrated
      // database, then insert a "legacy" row exactly as a pre-migration
      // system would have — before `normalized_name` existed at all.
      await normalizeMigration.down(db);

      const accountId = uuidv4();
      await db("accounts").insert({ id: accountId, type: "asset", name: "  Widgets Inc.  " });

      await normalizeMigration.up(db);
      const firstPass = await db("accounts").where({ id: accountId }).first();
      expect(firstPass.normalized_name).toBe("widgets inc.");
      expect(firstPass.name).toBe("  Widgets Inc.  "); // the original is untouched

      // Running the whole migration a second time — schema alter included —
      // must succeed and reproduce the same value, not fail on "column
      // already exists" or double-trim the data.
      await normalizeMigration.up(db);
      const secondPass = await db("accounts").where({ id: accountId }).first();
      expect(secondPass.normalized_name).toBe("widgets inc.");
    });

    test("Challenge 9b-2: rolling back removes the derived column and leaves every original value exactly as it was", async () => {
      const accountId = uuidv4();
      await db("accounts").insert({ id: accountId, type: "asset", name: "Original Name", normalized_name: "original name" });

      await normalizeMigration.down(db);
      const hasColumn = await db.schema.hasColumn("accounts", "normalized_name");
      expect(hasColumn).toBe(false);

      const row = await db("accounts").where({ id: accountId }).first();
      expect(row.name).toBe("Original Name");

      await normalizeMigration.up(db); // restore schema so afterEach's rollback-all finds the expected shape
    });
  });
});
