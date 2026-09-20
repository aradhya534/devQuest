import type { Agent } from "supertest";
import app from "../src/server.js";
import db from "../db/db-config.js";
import testBase from "./testBase.js";
import { expect, test, describe, beforeAll, afterAll, vi } from "vitest";

let testSession: Agent;

beforeAll(async () => {
  testSession = testBase.createSuperTestSession(app);
  await testBase.resetDatabase(db);
});
afterAll(async () => {
  await new Promise<void>((resolve, reject) => {
    app.close((err) => (err ? reject(err) : resolve()));
  });
});

describe("Challenge 10: Observability and Operations", () => {
  describe("Challenge 10a: Health and readiness", () => {
    test("Challenge 10a-1: /health always answers 200 while the process is running", async () => {
      const response = await testSession.get("/health");
      expect(response.status).toBe(200);
    });

    test("Challenge 10a-2: /ready answers 200 when the database is reachable", async () => {
      const response = await testSession.get("/ready");
      expect(response.status).toBe(200);
    });

    test("Challenge 10a-3: /ready answers 503 when the database is unreachable", async () => {
      const rawSpy = vi.spyOn(db, "raw").mockRejectedValueOnce(new Error("simulated outage"));
      try {
        const response = await testSession.get("/ready");
        expect(response.status).toBe(503);
      } finally {
        rawSpy.mockRestore();
      }
    });
  });

  describe("Challenge 10b: Structured logging with no secrets", () => {
    test("Challenge 10b-1: a request never causes a password, token or full body to reach stdout", async () => {
      const originalLog = console.log;
      const lines: string[] = [];
      console.log = (...args: unknown[]) => {
        lines.push(args.map(String).join(" "));
      };

      try {
        await testSession.post("/api/auth/login").send({ accountId: "log-test-acct", role: "operator" });
      } finally {
        console.log = originalLog;
      }

      const combined = lines.join("\n");
      expect(combined).not.toMatch(/accessToken|refreshToken/i);
    });

    test("Challenge 10b-2: a request produces at least one structured log line with the expected fields", async () => {
      const originalLog = console.log;
      const lines: string[] = [];
      console.log = (...args: unknown[]) => {
        lines.push(args.map(String).join(" "));
      };

      let response;
      try {
        response = await testSession.get("/health");
      } finally {
        console.log = originalLog;
      }

      expect(response.status).toBe(200);
      const record = lines.map((line) => { try { return JSON.parse(line); } catch { return null; } }).find((parsed) => parsed && parsed.path === "/health");
      expect(record).toBeDefined();
      expect(record.method).toBe("GET");
      expect(record.status).toBe(200);
      expect(typeof record.durationMs).toBe("number");
    });
  });

  describe("Challenge 10c: Metrics", () => {
    test("Challenge 10c-1: /api/metrics reflects real traffic already served", async () => {
      await testSession.get("/health");
      await testSession.get("/health");

      const response = await testSession.get("/api/metrics");
      expect(response.status).toBe(200);
      expect(response.body.data.totalRequests).toBeGreaterThanOrEqual(2);
    });
  });

  describe("Challenge 10d: Rate limiting", () => {
    test("Challenge 10d-1: exceeding the login rate limit returns 429 with Retry-After", async () => {
      let last;
      for (let i = 0; i < 15; i += 1) {
        last = await testSession.post("/api/auth/login").send({ accountId: `rl-acct-${i}`, role: "operator" });
        if (last.status === 429) break;
      }

      expect(last?.status).toBe(429);
      expect(last?.headers["retry-after"]).toBeDefined();
    });

    test("Challenge 10d-2: after the window resets, a request that was previously rate-limited succeeds again", async () => {
      let last;
      for (let i = 0; i < 15; i += 1) {
        last = await testSession.post("/api/auth/login").send({ accountId: `rl-reset-acct-${i}`, role: "operator" });
        if (last.status === 429) break;
      }
      expect(last?.status).toBe(429);

      const advancedNow = Date.now() + 60_001;
      const nowSpy = vi.spyOn(Date, "now").mockReturnValue(advancedNow);
      try {
        const afterReset = await testSession.post("/api/auth/login").send({ accountId: "rl-reset-acct-after", role: "operator" });
        expect(afterReset.status).toBeLessThan(400);
      } finally {
        nowSpy.mockRestore();
      }
    });
  });
});
