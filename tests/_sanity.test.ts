import fc from "fast-check";
import fs from "node:fs";
import path from "node:path";
import type { Agent } from "supertest";
import app from "../src/server.js";
import db from "../db/db-config.js";
import testBase from "./testBase.js";
import { beforeAll, afterAll, describe, test, expect } from "vitest";
import HttpStatus from "../src/enums/httpStatus.js";

let testSession: Agent;

/**
 * Sanity tests: they confirm the environment is set up correctly, and they PASS on a fresh clone,
 * before any challenge is implemented. Run them first:  npm test _sanity.test.ts
 * They are not scored. If one fails, fix your setup before you start on the challenges.
 */

beforeAll(async () => {
  testSession = testBase.createSuperTestSession(app);
  await testBase.resetDatabase(db);
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) => {
    app.close((err) => (err ? reject(err) : resolve()));
  });
});

describe("Environment Sanity Tests", () => {
  test("Node.js is version 18.19 or newer (20 or 22 recommended)", () => {
    const [major = 0, minor = 0] = process.versions.node.split(".").map(Number);
    expect(major > 18 || (major === 18 && minor >= 19), `Node ${process.versions.node} is too old`).toBe(true);
  });

  test("Dependencies are installed (run `npm install` if this fails)", async () => {
    for (const name of ["express", "knex", "sqlite3", "bcrypt", "jsonwebtoken", "supertest", "fast-check", "jsdom"]) {
      await expect(import(name), `could not load "${name}"`).resolves.toBeDefined();
    }
  });

  test(".env file exists with PORT and JWT_PRIVATE_KEY", () => {
    const envPath = path.resolve(process.cwd(), ".env");
    expect(fs.existsSync(envPath), ".env is missing from the project root").toBe(true);
    const content = fs.readFileSync(envPath, "utf8");
    expect(content).toMatch(/^PORT=\d+/m);
    expect(content).toMatch(/^JWT_PRIVATE_KEY=.+/m);
  });

  test("The server module loads and a test session can be created", () => {
    expect(app).toBeDefined();
    expect(testSession).toBeDefined();
  });

  test("Database connection works", async () => {
    const result = await db.raw("SELECT 1 as test");
    expect(result[0].test).toBe(1);
  });

  test("Migrations apply and every required table exists", async () => {
    for (const table of ["accounts", "ledger_entries", "account_balances", "events"]) {
      expect(await db.schema.hasTable(table), `table "${table}" is missing — check db/migrations`).toBe(true);
    }
  });

  test("The local database file exists (run `npm run migrate` if this fails)", () => {
    console.log("\n\n======= IMPORTANT NOTICE =======");
    console.log("`npm start` uses the local SQLite file main.sqlite3.");
    console.log("This test FAILS if you have not run:");
    console.log("  npm run migrate");
    console.log("  npm run seed");
    console.log("================================\n\n");
    expect(fs.existsSync(path.resolve(process.cwd(), "main.sqlite3"))).toBe(true);
  });

  test("The asset registry endpoint responds with the supported assets", async () => {
    const response = await testSession.get("/api/assets");
    expect(response.status).toBe(HttpStatus.OK);
    const codes = (response.body.data as { code: string }[]).map((asset) => asset.code);
    expect(codes).toEqual(expect.arrayContaining(["USD", "JPY", "BHD", "BTC"]));
  });

  test("Routes exist: unknown paths are 404, real ones are not", async () => {
    expect((await testSession.get("/api/this-route-does-not-exist")).status).toBe(HttpStatus.NOT_FOUND);
    // These reject bad input before reaching any code you are asked to write, so they must not be 404.
    expect((await testSession.post("/api/settlement/holds").send({})).status).toBe(HttpStatus.BAD_REQUEST);
    expect((await testSession.get("/api/orders/book/BTC-USD")).status).toBe(HttpStatus.OK);
  });

  test("The property-testing library works", () => {
    fc.assert(fc.property(fc.integer(), fc.integer(), (a, b) => a + b === b + a));
  });

  test("The protected test helpers are in place", () => {
    for (const file of ["tests/testBase.ts", "tests/setup.ts", "vitest.config.ts", "config/scores.ts"]) {
      expect(fs.existsSync(path.resolve(process.cwd(), file)), `${file} is missing`).toBe(true);
    }
  });
});
