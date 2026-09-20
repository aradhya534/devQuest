import fc from "fast-check";
import type { Agent } from "supertest";
import app from "../src/server.js";
import db from "../db/db-config.js";
import testBase from "./testBase.js";
import { expect, test, describe, beforeAll, afterAll, afterEach } from "vitest";
import HttpStatus from "../src/enums/httpStatus.js";
import { replay, type StoredEvent } from "../src/domain/events.js";

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

async function deposit(accountId: string, asset: string, amount: string) {
  return testSession.post("/api/events/deposits").send({ accountId, asset, amount });
}

function fakeEvent(seq: number, accountId: string, amount: string): StoredEvent {
  return { seq, type: "deposited", accountId, asset: "USD", amount, hash: "irrelevant-for-pure-reducer-tests", prevHash: null };
}

describe("Challenge 06: Event Sourcing and Deterministic Replay", () => {
  describe("Challenge 6a: Chain integrity", () => {
    test("Challenge 6a-1: every appended event chains its hash to its predecessor's", async () => {
      const first = await deposit("acct-1", "USD", "100");
      const second = await deposit("acct-1", "USD", "50");
      expect(first.body.data.hash).not.toBe(second.body.data.hash);

      const verification = await testSession.get("/api/events/verify");
      expect(verification.body.data.valid).toBe(true);
    });

    test("Challenge 6a-2: tampering with a historical event's amount is detected, and the first broken link is reported", async () => {
      await deposit("acct-1", "USD", "100");
      const second = await deposit("acct-1", "USD", "50");

      await db("events").where({ seq: second.body.data.seq }).update({ amount: "999999" });

      const verification = await testSession.get("/api/events/verify");
      expect(verification.body.data.valid).toBe(false);
      expect(verification.body.data.firstBrokenSeq).toBe(second.body.data.seq);
    });
  });

  describe("Challenge 6b: Rebuild fidelity", () => {
    test("Challenge 6b-1: rebuilding from the full event log matches the live projection after a randomised sequence of deposits", async () => {
      const deposits = [
        { accountId: "acct-a", amount: "100" },
        { accountId: "acct-b", amount: "40" },
        { accountId: "acct-a", amount: "25" },
        { accountId: "acct-a", amount: "10" },
        { accountId: "acct-b", amount: "5" },
      ];
      for (const d of deposits) await deposit(d.accountId, "USD", d.amount);

      const rebuild = await testSession.get("/api/events/rebuild");
      expect(rebuild.body.data["acct-a:USD"]).toBe("135");
      expect(rebuild.body.data["acct-b:USD"]).toBe("45");
    });

    test("Challenge 6b-2: snapshot plus tail replay equals a full replay from the log", async () => {
      await deposit("acct-c", "USD", "10");
      const middle = await deposit("acct-c", "USD", "20");
      await deposit("acct-c", "USD", "30");

      await testSession.post("/api/events/snapshots").send({ upToSeq: middle.body.data.seq });

      const viaSnapshot = await testSession.get("/api/events/state").query({ atSequence: "999999" });
      const fullRebuild = await testSession.get("/api/events/rebuild");
      expect(viaSnapshot.body.data).toEqual(fullRebuild.body.data);
    });

    test("Challenge 6b-3: state-at-sequence for an arbitrary earlier point excludes later events", async () => {
      const first = await deposit("acct-d", "USD", "10");
      await deposit("acct-d", "USD", "20");

      const atFirst = await testSession.get("/api/events/state").query({ atSequence: String(first.body.data.seq) });
      expect(atFirst.body.data["acct-d:USD"]).toBe("10");
    });
  });

  describe("Challenge 6c: Idempotent and order-tolerant replay (pure reducer)", () => {
    test("Challenge 6c-1: property — replaying a randomly duplicated and shuffled event list yields the same balances as the deduplicated original", () => {
      fc.assert(
        fc.property(fc.array(fc.tuple(fc.constantFrom("a", "b", "c"), fc.integer({ min: 1, max: 1000 })), { minLength: 1, maxLength: 15 }), (deposits) => {
          const events = deposits.map(([account, amount], index) => fakeEvent(index + 1, account, String(amount)));

          const canonical = replay(events);

          const duplicated = [...events, ...events]; // every event delivered twice
          const shuffledDuplicated = [...duplicated].sort(() => Math.random() - 0.5);

          const result = replay(shuffledDuplicated);
          expect(Object.fromEntries(result)).toEqual(Object.fromEntries(canonical));
        }),
      );
    });
  });

  describe("Challenge 6d: Sequencing", () => {
    test("Challenge 6d-1: event sequence numbers are strictly increasing with no gaps", async () => {
      const seqs: number[] = [];
      for (let i = 0; i < 5; i += 1) {
        const response = await deposit("acct-e", "USD", "1");
        seqs.push(response.body.data.seq);
      }
      for (let i = 1; i < seqs.length; i += 1) {
        expect(seqs[i]).toBe((seqs[i - 1] ?? 0) + 1);
      }
    });
  });
});
