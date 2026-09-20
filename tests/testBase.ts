import session from "supertest-session";
import type { Server } from "http";
import type { Knex } from "knex";

// Set up test environment
process.env.NODE_ENV = "test";
process.env.HMAC_SECRET = process.env.HMAC_SECRET ?? "testOnlyDefaultHmacSecret";

// A healthy request answers in milliseconds. A request that gets no answer at all (for example a route that
// throws inside an async handler nobody forwards to next()) would otherwise sit until the whole test times out;
// failing it after a few seconds keeps a full grading run short without changing what any test asserts.
const REQUEST_TIMEOUT = { response: 4000, deadline: 8000 };
const HTTP_METHODS = ["get", "post", "put", "patch", "delete", "head", "options"] as const;

const createSuperTestSession = (app: Server) => {
  const agent = session(app);
  for (const method of HTTP_METHODS) {
    if (typeof (agent as unknown as Record<string, unknown>)[method] !== "function") continue;
    const original = agent[method].bind(agent) as (...args: unknown[]) => { timeout: (options: typeof REQUEST_TIMEOUT) => unknown };
    (agent as unknown as Record<string, unknown>)[method] = (...args: unknown[]) => original(...args).timeout(REQUEST_TIMEOUT);
  }
  return agent;
};

/**
 * Rolls every migration all the way back, then reapplies them, before
 * running seeds. `migrate.latest()` alone is a no-op once the schema is
 * current, which left ledger/order tables accumulating rows across tests in
 * the same file — only the old inventory seeds ever `.del()`'d their own
 * tables. A full rollback+reapply gives every table a clean slate per test,
 * independent of whether a seed file happens to clear it.
 */
async function resetDatabase(db: Knex): Promise<void> {
  await db.migrate.rollback(undefined, true);
  await db.migrate.latest();
  // Only the no-op seed: demo data (db/seeds/01_initial_accounts.ts) is exercised explicitly by its own tests.
  await db.seed.run({ specific: "00_noop.ts" });
}

export default {
  createSuperTestSession,
  resetDatabase,
};
