# SKILL.md — ClearHouse (DevQuest 2026)

A working guide for AI agents and developers operating on this repository. Read this before making changes.

---

## 1. What this project is

**ClearHouse** is a deliberately flawed, multi-asset trading / clearing / settlement platform used for the DevQuest 2026 final hackathon. It is built with:

- **Runtime:** Node.js (>=18.19, Node 20/22 recommended), TypeScript, ES modules (`"type": "module"`)
- **Web:** Express 4
- **DB:** Knex + SQLite (file `main.sqlite3` in dev, `:memory:` in tests)
- **Tests:** Vitest + Supertest + fast-check (property tests)
- **Client:** Vanilla JS operator dashboard under `client/`

> WARNING: This codebase intentionally contains planted bugs, bad design and security anti-patterns. The README states it "does NOT represent best practices." Do not "fix" things that are not part of the current task — many defects are graded challenges.

The tests in `tests/` are the **specification**. Business logic is stubbed with `NotImplementedError` until implemented.

---

## 2. Setup (run these first)

```bash
npm install                 # install dependencies
npm run migrate             # delete + rebuild SQLite schema (creates main.sqlite3)
npm run seed                # load demo data
npx vitest run tests/_sanity.test.ts   # environment sanity check - must pass before challenges
```

### Scripts (from `package.json`)

| Script | Purpose |
|---|---|
| `npm start` | Run the server (`tsx src/server.ts`) |
| `npm run start-dev` | Watch mode |
| `npm run migrate` | `delete-db` then `knex migrate:latest` |
| `npm run seed` | `knex seed:run` |
| `npm run delete-db` | Deletes the SQLite file (`del-cli main.sqlite`) |
| `npm run typecheck` | `tsc --noEmit` for app **and** tests |
| `npm test` | `vitest` |

> WARNING: `delete-db` targets `main.sqlite`, but the real dev DB file is **`main.sqlite3`** (see `knexfile.js`). This mismatch is a **planted bug** (Challenge 0v). Do not silently "fix" it outside of that challenge.

---

## 3. Environment configuration (`.env`)

A `.env` file is required in the project root. `dotenv.config()` runs in `src/server.ts`, and `tests/_sanity.test.ts` asserts it exists with `PORT` and `JWT_PRIVATE_KEY`.

Required variables (keep values **unquoted** and on their own lines so the sanity regexes `^PORT=\d+` and `^JWT_PRIVATE_KEY=.+` match):

```dotenv
PORT=3001
HMAC_SECRET=b1f3e9a2c7d84f0691a5e6c2d9807b4f3a2e1c9d8b7a6f5e4d3c2b1a09f8e7d6
JWT_PRIVATE_KEY=582bd4512529ca75ac9554ca0372a6d48103c07c875df2841a463b9a826b749e42edc119c6aee2cab6c8b4f7fa73c891b7dba9e3aa85c5550ef44cee7d083b5c
GRADING_SEED=20260101
```

- `config/buildspec.yml` holds the source-of-truth values used by the CI grader - mirror them locally.
- Under test (`NODE_ENV === "test"`), `tests/testBase.ts` sets `NODE_ENV` and falls back to `HMAC_SECRET || "testOnlyDefaultHmacSecret"`.
- `.gitignore` currently only lists `node_modules` - **do not commit** real secrets if you change this.

---

## 4. Project layout

```
src/
  server.ts                  # Express app + middleware wiring; exports the http.Server
  controller/                # HTTP layer: parse req, call domain, shape response
  domain/                    # Pure business logic (the challenges live here)
  enums/httpStatus.ts        # HttpStatus enum  (UNAUTHORIZED/FORBIDDEN are SWAPPED)
  middleware/                # hmacAuth, rbac, rateLimit, logging, securityHeaders, asyncHandler...
  repositories/              # Knex data access
  routes/                    # Express routers, mounted under /api
  services/                  # cache, metrics, liveHub, matchingEngine, wsHub...
  types/                     # express.d.ts global augmentation (req.principal, req.rawBody)
db/
  db-config.ts               # Knex instance; uses config.test when NODE_ENV=test
  migrations/                # schema
  seeds/                     # 00_noop (clean slate) + 01_initial_accounts (demo data)
config/
  buildspec.yml              # CI env + grading steps
  devgradeconfig.yml         # grader metadata
  scores.ts                  # test-name -> points map (MUST match JUnit names verbatim)
  run-tests.mjs              # per-file isolated test runner (merges JUnit reports)
tests/
  _sanity.test.ts            # environment checks (not scored)
  testBase.ts                # supertest session + resetDatabase helpers
  setup.ts                   # registers tsx, configures fast-check seed
  challenge00..21.test.ts    # the graded specification
client/                      # vanilla-JS dashboard (app.js, dashboard.js, liveFeed.js, signer.js)
```

---

## 5. Coding conventions (match the existing style)

- **ES module imports use `.js` extensions** even though the source is `.ts` (e.g. `import assetsRoutes from "./routes/assetsRoutes.js"`). Keep this — `moduleResolution: bundler` + ESM.
- **Controllers return `Response`** and use `HttpStatus` constants; response shapes follow a strict envelope:
  - Success: `{ data, meta }`
  - Error: `{ error: { code, details: [{ message }] } }`
- **Domain functions are pure** and throw typed errors (`MoneyError`, `AssetError`, `NotImplementedError`). Controllers translate those to HTTP status + error code.
- **Money is `{ amount: bigint; asset: string }`** in minor units. Never use JS `number` for amounts (must survive >2^53). Parse strictly; reject non-string, leading zeros, `+`, `e`-notation, non-ASCII digits.
- TypeScript is **strict** (`noUncheckedIndexedAccess`, `noUnusedLocals`, `noUnusedParameters`). Run `npm run typecheck` before finishing.
- Async route handlers should be wrapped with `asyncHandler` so rejections reach Express's error middleware — check `src/middleware/asyncHandler.ts` (it currently does **not** do this; that is Challenge 0c).

### HMAC signing contract (`src/middleware/hmacAuth.ts`, `client/js/signer.js`, `tests/challenge01.test.ts`)

- Headers: `X-Signature`, `X-Timestamp`, `X-Nonce`, `X-Algorithm: HMAC-SHA256`.
- Message = `METHOD` + newline + `path` + newline + `SHA256hex(rawBody)` + newline + `timestamp` + newline + `nonce`.
- Signature = `HMAC-SHA256(secret, message)` hex.
- Window = 30s; nonces are single-use (replay protection).
- WARNING: `client/js/signer.js` joins with `|` instead of a newline — a **planted bug** (Challenge 0t / 12d).

### Auth / RBAC (`src/middleware/rbac.ts`)

- `attachPrincipal` decodes a `Bearer` token when present and attaches `req.principal`; missing/invalid token is *not* rejected here.
- `requireRole(role)` gates admin/operator routes.
- `requireOwnAccount` enforces tenant isolation **only when a principal exists** (anonymous callers pass through — this is intentional so other challenges' anonymous tests keep working).

---

## 6. Testing & grading conventions

- **Every graded test name is duplicated verbatim in `config/scores.ts`** as `"<describe chain> > <test name>"`. If you edit a test's describe/test text or nesting, regenerate with:
  ```bash
  npx tsx config/generate-scores.ts <test-file>
  ```
  Otherwise the grader silently scores 0 for those tests.
- Tests use `testBase.createSuperTestSession(app)` and call `await testBase.resetDatabase(db)` in `beforeAll`/`afterEach`. `resetDatabase` does a full `migrate.rollback` + `latest` + `00_noop` seed for a clean slate per test.
- `tests/setup.ts` registers `tsx/esm` (so Knex can import TS migrations/seeds) and configures fast-check with `GRADING_SEED` (100 runs, `endOnFailure: true`). Keep property tests **deterministic**.
- Run a single file: `npx vitest run tests/challenge01.test.ts`. Filter a test: add `-t "Challenge 1a-1"`.
- `config/run-tests.mjs` runs each test file in its own process with a timeout and merges JUnit reports into `test-results.xml`. CI (`buildspec.yml`) deletes any stale `test-results.xml` first and fails the build if a fresh one is not produced.
- The grader reads **JUnit `testcase` names**, so assertion/response messages don't matter, but the test *names* do.

---

## 7. Known planted bugs (do not blanket-fix)

These are deliberately broken and are graded (see `config/scores.ts` -> `bugs`). Fix only the one the current task names:

| Location | Defect |
|---|---|
| `src/enums/httpStatus.ts` | `UNAUTHORIZED = 403` and `FORBIDDEN = 401` are swapped (correct: 401 / 403) |
| `src/services/cache.ts` | `invalidate()` calls `get()` without deleting (no-op) |
| `src/middleware/asyncHandler.ts` | Does not `return`/forward the promise, so async rejections are lost |
| `client/js/signer.js` | Signs with a `|` separator instead of a newline |
| `package.json` (`delete-db`) | Deletes `main.sqlite`, not the real `main.sqlite3` |
| `src/middleware/securityHeaders.ts` | Header name/fingerprint issues (Challenge 0e/7e) |
| `src/services/riskRegistry.ts` | Reservation/reassignment bugs (Challenge 0j) |
| Others | See comments in `config/scores.ts` — "bug hunt" sections |

If a task targets a specific challenge, scope your fix to that challenge's files and tests. Run the full suite before declaring done, because fixes must not break other challenges.

---

## 8. Do / Don't

**Do**
- Read the relevant `tests/challengeNN.test.ts` first — it is the spec.
- Keep changes minimal and localized; match existing style and the response envelope.
- Run `npm run typecheck` and the affected `vitest` files before finishing.
- Keep `.env` values unquoted and mirror `config/buildspec.yml`.

**Don't**
- Don't reformat or "clean up" unrelated files.
- Don't change test assertions to make tests pass — fix the implementation instead.
- Don't use JS `number` for money; use `bigint`.
- Don't commit secrets or the SQLite DB file.
- Don't assume a passing sanity run means challenges pass — the stub logic still throws `NotImplementedError`.

---

## 9. Quick reference

```bash
# Full setup from scratch
npm install && npm run migrate && npm run seed
npx vitest run tests/_sanity.test.ts      # verify environment

# Work on one challenge
npx vitest run tests/challenge03.test.ts  # matching engine
npm run typecheck

# Regenerate score-name map after renaming tests
npx tsx config/generate-scores.ts tests/challenge03.test.ts
```
