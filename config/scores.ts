export interface ScoreEntry {
  desc: string;
  score: number;
}

export interface Scores {
  bugs: ScoreEntry[];
  features: ScoreEntry[];
}

// Names below must match the JUnit testcase name exactly: the describe chain
// joined with " > ", verbatim including punctuation. Regenerate a block with
// `npx tsx config/generate-scores.ts <test-file>` after editing a test file's
// names or nesting, rather than hand-editing these strings.
//
// Every entry here corresponds to a real test in this repository's test
// suite — the participant skeleton ships with every one of these tests
// failing (the business logic they exercise is stubbed to throw
// NotImplementedError), and a test passes once the corresponding challenge
// is correctly implemented. A point total below a challenge's full spec
// value means this test file covers only part of that challenge's
// write-up; see DEVQUEST_2026_CLEARHOUSE_CHALLENGES.md for what full credit
// would require.
export const scores: Scores = {
  bugs: [
    // Challenge 00: Infrastructure Bug Hunt — 200/200.
    {
      desc: "Challenge 00: Infrastructure Bug Hunt > Challenge 0a: Authorization > Challenge 0a-1: an operator principal is rejected by an admin-only route guard, and an admin principal is accepted",
      score: 40,
    },
    {
      desc: "Challenge 00: Infrastructure Bug Hunt > Challenge 0b: Replay protection > Challenge 0b-1: a replayed nonce is rejected on the second use of the same signed request",
      score: 40,
    },
    {
      desc: "Challenge 00: Infrastructure Bug Hunt > Challenge 0c: Async error handling > Challenge 0c-1: a rejected promise from the wrapped handler reaches next(), not an unhandled rejection",
      score: 35,
    },
    {
      desc: "Challenge 00: Infrastructure Bug Hunt > Challenge 0d: HTTP status codes > Challenge 0d-1: UNAUTHORIZED is 401 and FORBIDDEN is 403, the literal values every HTTP client expects",
      score: 30,
    },
    {
      desc: "Challenge 00: Infrastructure Bug Hunt > Challenge 0e: Security headers > Challenge 0e-1: the Content-Security-Policy header is actually sent under its correct name",
      score: 30,
    },
    {
      desc: "Challenge 00: Infrastructure Bug Hunt > Challenge 0f: Response cache > Challenge 0f-1: invalidate actually removes the cached entry",
      score: 25,
    },
    // Bug hunt part 2: defects planted in the shipped, working code (registry values, cache, risk registry,
    // settlement and idempotency, account handling, validation, migrations, dashboard wiring, project scripts).
    // Each test fails on the untouched template and passes once that one defect is fixed.
    {
      desc: "Challenge 00: Infrastructure Bug Hunt > Challenge 0g: HTTP status codes > Challenge 0g-1: every status code the API uses has its standard value",
      score: 15,
    },
    {
      desc: "Challenge 00: Infrastructure Bug Hunt > Challenge 0h: Asset registry > Challenge 0h-1: each asset has the exponent the specification gives it",
      score: 15,
    },
    {
      desc: "Challenge 00: Infrastructure Bug Hunt > Challenge 0i: Response cache > Challenge 0i-1: an entry lives for exactly its ttl in milliseconds and is gone afterwards",
      score: 20,
    },
    {
      desc: "Challenge 00: Infrastructure Bug Hunt > Challenge 0j: Risk registry > Challenge 0j-1: an order's risk reservation can be taken exactly once",
      score: 20,
    },
    {
      desc: "Challenge 00: Infrastructure Bug Hunt > Challenge 0j: Risk registry > Challenge 0j-2: resetting the registry also disengages the kill switch",
      score: 15,
    },
    {
      desc: "Challenge 00: Infrastructure Bug Hunt > Challenge 0j: Risk registry > Challenge 0j-3: one account's limits never apply to another account",
      score: 20,
    },
    {
      desc: "Challenge 00: Infrastructure Bug Hunt > Challenge 0k: Matching engine service > Challenge 0k-1: cancelling an order id that was never placed reports not found",
      score: 15,
    },
    {
      desc: "Challenge 00: Infrastructure Bug Hunt > Challenge 0k: Matching engine service > Challenge 0k-2: an empty market has no best bid and no best ask, not a zero price",
      score: 15,
    },
    {
      desc: "Challenge 00: Infrastructure Bug Hunt > Challenge 0l: Balances > Challenge 0l-1: the balance endpoint reports total as available plus held",
      score: 20,
    },
    {
      desc: "Challenge 00: Infrastructure Bug Hunt > Challenge 0l: Balances > Challenge 0l-2: the balance endpoint rejects a request that names no asset",
      score: 15,
    },
    {
      desc: "Challenge 00: Infrastructure Bug Hunt > Challenge 0l: Balances > Challenge 0l-3: updating an existing balance row writes both available and held",
      score: 25,
    },
    {
      desc: "Challenge 00: Infrastructure Bug Hunt > Challenge 0m: Idempotency > Challenge 0m-1: reusing an idempotency key with a different body is a conflict, and with the same body replays the first result",
      score: 30,
    },
    {
      desc: "Challenge 00: Infrastructure Bug Hunt > Challenge 0n: Account status > Challenge 0n-1: an account id that was never registered is not treated as closed, and a closed one is",
      score: 20,
    },
    {
      desc: "Challenge 00: Infrastructure Bug Hunt > Challenge 0n: Account status > Challenge 0n-2: a newly created account is active",
      score: 15,
    },
    {
      desc: "Challenge 00: Infrastructure Bug Hunt > Challenge 0o: Account creation > Challenge 0o-1: an account with an unknown type is rejected",
      score: 15,
    },
    {
      desc: "Challenge 00: Infrastructure Bug Hunt > Challenge 0o: Account creation > Challenge 0o-2: an account with a blank name is rejected",
      score: 15,
    },
    {
      desc: "Challenge 00: Infrastructure Bug Hunt > Challenge 0o: Account creation > Challenge 0o-3: two accounts may share a name",
      score: 20,
    },
    {
      desc: "Challenge 00: Infrastructure Bug Hunt > Challenge 0p: Order validation > Challenge 0p-1: an order with a zero quantity or a zero price is rejected before it reaches the engine",
      score: 25,
    },
    {
      desc: "Challenge 00: Infrastructure Bug Hunt > Challenge 0q: Risk limits validation > Challenge 0q-1: a negative or fractional open-order limit is rejected",
      score: 20,
    },
    {
      desc: "Challenge 00: Infrastructure Bug Hunt > Challenge 0r: Market data input > Challenge 0r-1: a trade with a non-numeric price or quantity is a 400, not a crash",
      score: 20,
    },
    {
      desc: "Challenge 00: Infrastructure Bug Hunt > Challenge 0s: Error handling > Challenge 0s-1: a malformed JSON body is a 400 in the standard error envelope",
      score: 20,
    },
    {
      desc: "Challenge 00: Infrastructure Bug Hunt > Challenge 0t: Dashboard request signing > Challenge 0t-1: the dashboard signs a request exactly as the server verifies it",
      score: 30,
    },
    {
      desc: "Challenge 00: Infrastructure Bug Hunt > Challenge 0u: Dashboard page wiring > Challenge 0u-1: every element the dashboard script looks up exists in the page",
      score: 20,
    },
    {
      desc: "Challenge 00: Infrastructure Bug Hunt > Challenge 0v: Project scripts > Challenge 0v-1: the delete-db script removes the database file the application actually uses",
      score: 10,
    },
    // Shipped defects in Challenges 07, 09 and 11 that are fixed rather than built (moved here from features).
    {
      desc: "Challenge 07: The Adversarial Gauntlet > Challenge 7d: Payload abuse > Challenge 7d-1: an oversized body is rejected with 413, not a hang or a 500",
      score: 9,
    },
    {
      desc: "Challenge 07: The Adversarial Gauntlet > Challenge 7d: Payload abuse > Challenge 7d-2: a deeply nested body is rejected cleanly, not with a crash",
      score: 9,
    },
    {
      desc: "Challenge 07: The Adversarial Gauntlet > Challenge 7e: Security headers and disclosure > Challenge 7e-1: responses carry baseline security headers and no framework fingerprint",
      score: 8,
    },
    {
      desc: "Challenge 09: Reconciliation, Reporting and Migration > Challenge 9b: Legacy data migration > Challenge 9b-1: the normalisation backfill is idempotent and non-destructive to the original column",
      score: 14,
    },
    {
      desc: "Challenge 09: Reconciliation, Reporting and Migration > Challenge 9b: Legacy data migration > Challenge 9b-2: rolling back removes the derived column and leaves every original value exactly as it was",
      score: 9,
    },
    {
      desc: "Challenge 11: API Design and Performance > Challenge 11a: Response envelope consistency > Challenge 11a-2: a representative error response from every route family matches the { error: { code, details } } envelope",
      score: 13,
    },
    {
      desc: "Challenge 11: API Design and Performance > Challenge 11c: API versioning > Challenge 11c-1: the same route answers identically under /api and /api/v1",
      score: 10,
    },
    {
      desc: "Challenge 11: API Design and Performance > Challenge 11c: API versioning > Challenge 11c-2: an unknown version segment returns a clean 404, not a silent fallback",
      score: 10,
    },
    {
      desc: "Challenge 11: API Design and Performance > Challenge 11d: Latency budget > Challenge 11d-1: a representative read-only route stays within a documented latency budget under repeated load",
      score: 10,
    },
    // Bug hunt part 3: subtler defects (a race between concurrent requests, values beyond 2^53, shared state
    // handed to callers, registry aliasing, cleanup that never happens, a property that only fails for some inputs).
    {
      desc: "Challenge 00: Infrastructure Bug Hunt > Challenge 0w: Concurrency > Challenge 0w-1: requests sharing an idempotency key that arrive together run the operation once and agree on the result",
      score: 40,
    },
    {
      desc: "Challenge 00: Infrastructure Bug Hunt > Challenge 0x: Asset registry > Challenge 0x-1: changing an asset returned by the registry never changes the registry",
      score: 25,
    },
    {
      desc: "Challenge 00: Infrastructure Bug Hunt > Challenge 0x: Asset registry > Challenge 0x-2: property — an asset code is known exactly when it can be looked up",
      score: 25,
    },
    {
      desc: "Challenge 00: Infrastructure Bug Hunt > Challenge 0y: Large balances > Challenge 0y-1: balances beyond 2^53 are stored and read back exactly",
      score: 35,
    },
    {
      desc: "Challenge 00: Infrastructure Bug Hunt > Challenge 0z: Cleanup and shared state > Challenge 0z-1: expired cache entries are removed when they are read, not kept forever",
      score: 25,
    },
    {
      desc: "Challenge 00: Infrastructure Bug Hunt > Challenge 0z: Cleanup and shared state > Challenge 0z-2: the risk state handed out for an account with no activity is private to the caller",
      score: 25,
    },
  ],
  features: [
    // Challenge 01: Money, Assets, Authentication and Authorization (gate) — 120/120.
    {
      desc: "Challenge 01: Money, Assets and Authenticated Identity > Challenge 1a: Asset registry and strict amount parsing > Challenge 1a-1: known assets round-trip through the minor-unit parser",
      score: 6,
    },
    {
      desc: "Challenge 01: Money, Assets and Authenticated Identity > Challenge 1a: Asset registry and strict amount parsing > Challenge 1a-2: malformed amounts are rejected with 400, never silently coerced",
      score: 9,
    },
    {
      desc: "Challenge 01: Money, Assets and Authenticated Identity > Challenge 1a: Asset registry and strict amount parsing > Challenge 1a-3: amounts supplied as JSON numbers are rejected, not coerced to strings",
      score: 5,
    },
    {
      desc: "Challenge 01: Money, Assets and Authenticated Identity > Challenge 1a: Asset registry and strict amount parsing > Challenge 1a-4: decimal precision cannot exceed the asset's own exponent",
      score: 7,
    },
    {
      desc: "Challenge 01: Money, Assets and Authenticated Identity > Challenge 1a: Asset registry and strict amount parsing > Challenge 1a-5: property — parse and serialise round-trip for every asset and every valid integer",
      score: 6,
    },
    {
      desc: "Challenge 01: Money, Assets and Authenticated Identity > Challenge 1a: Asset registry and strict amount parsing > Challenge 1a-6: property — add/sub are inverses and asset-mismatch always throws",
      score: 6,
    },
    {
      desc: "Challenge 01: Money, Assets and Authenticated Identity > Challenge 1a: Asset registry and strict amount parsing > Challenge 1a-7: property — total order is antisymmetric and transitive",
      score: 6,
    },
    {
      desc: "Challenge 01: Money, Assets and Authenticated Identity > Challenge 1b: Rounding conserves value > Challenge 1b-1: half-even and half-up only disagree on an exact midpoint",
      score: 5,
    },
    {
      desc: "Challenge 01: Money, Assets and Authenticated Identity > Challenge 1b: Rounding conserves value > Challenge 1b-2: property — quotient * divisor + remainder reconstructs the dividend exactly",
      score: 6,
    },
    {
      desc: "Challenge 01: Money, Assets and Authenticated Identity > Challenge 1b: Rounding conserves value > Challenge 1b-3: division by zero is rejected, never produces Infinity or NaN",
      score: 2,
    },
    {
      desc: "Challenge 01: Money, Assets and Authenticated Identity > Challenge 1c: HMAC request signing > Challenge 1c-1: a correctly signed request is accepted",
      score: 2,
    },
    {
      desc: "Challenge 01: Money, Assets and Authenticated Identity > Challenge 1c: HMAC request signing > Challenge 1c-2: a missing signature is rejected",
      score: 2,
    },
    {
      desc: "Challenge 01: Money, Assets and Authenticated Identity > Challenge 1c: HMAC request signing > Challenge 1c-3: a signature computed over a different body is rejected",
      score: 2,
    },
    {
      desc: "Challenge 01: Money, Assets and Authenticated Identity > Challenge 1c: HMAC request signing > Challenge 1c-4: a timestamp outside the signing window is rejected",
      score: 2,
    },
    {
      desc: "Challenge 01: Money, Assets and Authenticated Identity > Challenge 1c: HMAC request signing > Challenge 1c-5: a replayed nonce is rejected on the second use",
      score: 2,
    },
    {
      desc: "Challenge 01: Money, Assets and Authenticated Identity > Challenge 1c: HMAC request signing > Challenge 1c-6: an unrecognised algorithm is rejected even with an otherwise valid signature",
      score: 2,
    },
    {
      desc: "Challenge 01: Money, Assets and Authenticated Identity > Challenge 1d: Authorization > Challenge 1d-1: an operator token is rejected on an admin-only route",
      score: 8,
    },
    {
      desc: "Challenge 01: Money, Assets and Authenticated Identity > Challenge 1d: Authorization > Challenge 1d-2: an admin-only route rejects a request with no token at all",
      score: 6,
    },
    {
      desc: "Challenge 01: Money, Assets and Authenticated Identity > Challenge 1d: Authorization > Challenge 1d-3: an admin token is accepted on an admin-only route",
      score: 6,
    },
    {
      desc: "Challenge 01: Money, Assets and Authenticated Identity > Challenge 1d: Authorization > Challenge 1d-4: a token acting on its own account's ledger balance succeeds",
      score: 6,
    },
    {
      desc: "Challenge 01: Money, Assets and Authenticated Identity > Challenge 1d: Authorization > Challenge 1d-5: a valid token cannot read a different account's ledger balance",
      score: 11,
    },
    {
      desc: "Challenge 01: Money, Assets and Authenticated Identity > Challenge 1d: Authorization > Challenge 1d-6: an anonymous request (no token at all) to a balance route is unaffected by tenant isolation",
      score: 6,
    },
    {
      desc: "Challenge 01: Money, Assets and Authenticated Identity > Challenge 1d: Authorization > Challenge 1d-7: refreshing rotates the token, and the old refresh token is rejected on reuse",
      score: 7,
    },

    // Challenge 02: The Double-Entry Ledger — 100/150. Not covered by these
    // tests: query-count budgets, the concurrent-mutation pagination walk,
    // and balance-derivation cost independent of history size.
    {
      desc: "Challenge 02: The Double-Entry Ledger > Challenge 2a: Balance rule > Challenge 2a-1: a balanced two-account entry is accepted",
      score: 12,
    },
    {
      desc: "Challenge 02: The Double-Entry Ledger > Challenge 2a: Balance rule > Challenge 2a-2: an entry that does not sum to zero for its asset is rejected, and nothing is written",
      score: 12,
    },
    {
      desc: "Challenge 02: The Double-Entry Ledger > Challenge 2a: Balance rule > Challenge 2a-3: an entry mixing two assets must balance each one independently",
      score: 12,
    },
    {
      desc: "Challenge 02: The Double-Entry Ledger > Challenge 2a: Balance rule > Challenge 2a-4: property — a random balanced posting set is always accepted, and derived balances match the reference sum",
      score: 15,
    },
    {
      desc: "Challenge 02: The Double-Entry Ledger > Challenge 2b: Append-only and reversal > Challenge 2b-1: reversing an entry restores the pre-entry balance exactly",
      score: 12,
    },
    {
      desc: "Challenge 02: The Double-Entry Ledger > Challenge 2b: Append-only and reversal > Challenge 2b-2: the trial balance across all accounts sums to zero for every asset touched",
      score: 12,
    },
    {
      desc: "Challenge 02: The Double-Entry Ledger > Challenge 2c: Point-in-time balances and statement pagination > Challenge 2c-1: an as-of balance excludes entries posted after the cutoff entry",
      score: 12,
    },
    {
      desc: "Challenge 02: The Double-Entry Ledger > Challenge 2c: Point-in-time balances and statement pagination > Challenge 2c-2: concatenating every statement page yields each posting exactly once",
      score: 13,
    },

    // Challenge 03: The Matching Engine — 250/250. Price-time priority,
    // IOC/FOK/post-only, self-trade prevention, stop and stop-limit
    // triggering, amendment priority rules, cancel/amend races, a
    // 10,000-operation determinism replay, a sub-linear performance tier
    // at 100,000 resting orders, and a randomized place/cancel
    // command-sequence property test (fast-check), checked against an
    // independent naive reference matcher after every command.
    {
      desc: "Challenge 03: The Matching Engine > Challenge 3a: Price-time priority > Challenge 3a-1: a crossing order trades at the resting order's price, not its own",
      score: 15,
    },
    {
      desc: "Challenge 03: The Matching Engine > Challenge 3a: Price-time priority > Challenge 3a-2: within one price level, the earlier order fills first",
      score: 15,
    },
    {
      desc: "Challenge 03: The Matching Engine > Challenge 3a: Price-time priority > Challenge 3a-3: a large aggressor sweeps multiple price levels in ascending price order",
      score: 18,
    },
    {
      desc: "Challenge 03: The Matching Engine > Challenge 3b: Order semantics > Challenge 3b-1: IOC fills what it can and never rests",
      score: 15,
    },
    {
      desc: "Challenge 03: The Matching Engine > Challenge 3b: Order semantics > Challenge 3b-2: FOK rejects entirely, leaving the book untouched, when it cannot fill in full",
      score: 18,
    },
    {
      desc: "Challenge 03: The Matching Engine > Challenge 3b: Order semantics > Challenge 3b-3: post-only is rejected rather than matched when it would cross on entry",
      score: 15,
    },
    {
      desc: "Challenge 03: The Matching Engine > Challenge 3b: Order semantics > Challenge 3b-4: self-trade prevention cancels the resting order and the aggressor continues against the rest of the book",
      score: 18,
    },
    {
      desc: "Challenge 03: The Matching Engine > Challenge 3c: Invariants > Challenge 3c-1: the book is never crossed after any sequence of orders",
      score: 20,
    },
    {
      desc: "Challenge 03: The Matching Engine > Challenge 3c: Invariants > Challenge 3c-2: total fills against an order never exceed its quantity",
      score: 12,
    },
    {
      desc: "Challenge 03: The Matching Engine > Challenge 3d: Cancellation > Challenge 3d-1: cancelling a resting order removes exactly it, and a second cancel reports not found",
      score: 9,
    },
    {
      desc: "Challenge 03: The Matching Engine > Challenge 3e: Stop and stop-limit orders > Challenge 3e-1: a stop order triggers as a market order once the last trade price reaches its stop price",
      score: 8,
    },
    {
      desc: "Challenge 03: The Matching Engine > Challenge 3e: Stop and stop-limit orders > Challenge 3e-2: a stop-limit order triggers as a limit order at its own price, not a market order",
      score: 6,
    },
    {
      desc: "Challenge 03: The Matching Engine > Challenge 3e: Stop and stop-limit orders > Challenge 3e-3: multiple stops triggered by the same trade fire in original submission order",
      score: 6,
    },
    {
      desc: "Challenge 03: The Matching Engine > Challenge 3f: Amendment > Challenge 3f-1: decreasing quantity preserves queue position",
      score: 3,
    },
    {
      desc: "Challenge 03: The Matching Engine > Challenge 3f: Amendment > Challenge 3f-2: a price change loses queue position, moving the order to the back of its new level",
      score: 4,
    },
    {
      desc: "Challenge 03: The Matching Engine > Challenge 3f: Amendment > Challenge 3f-3: a quantity increase loses queue position",
      score: 4,
    },
    {
      desc: "Challenge 03: The Matching Engine > Challenge 3f: Amendment > Challenge 3f-4: amending a non-existent or already-filled order returns 404",
      score: 3,
    },
    {
      desc: "Challenge 03: The Matching Engine > Challenge 3f: Amendment > Challenge 3f-5: amending to a non-positive quantity is rejected",
      score: 2,
    },
    {
      desc: "Challenge 03: The Matching Engine > Challenge 3f: Amendment > Challenge 3f-6: decreasing the quantity of an order that is NOT at the front keeps its exact place in the queue",
      score: 4,
    },
    {
      desc: "Challenge 03: The Matching Engine > Challenge 3g: Concurrency > Challenge 3g-1: a cancel racing an aggressing fill resolves to exactly one consistent outcome",
      score: 13,
    },
    {
      desc: "Challenge 03: The Matching Engine > Challenge 3g: Concurrency > Challenge 3g-2: an amend racing an aggressing fill never double-counts quantity",
      score: 12,
    },
    {
      desc: "Challenge 03: The Matching Engine > Challenge 3h: Determinism > Challenge 3h-1: replaying the same 10,000-operation sequence twice produces identical trades and an identical final book",
      score: 15,
    },
    {
      desc: "Challenge 03: The Matching Engine > Challenge 3i: Performance > Challenge 3i-1: per-order insert cost does not grow linearly with book depth",
      score: 15,
    },

    // Challenge 04: Settlement, Holds and Atomicity — 130/200. Not covered
    // by these tests: maker/taker fee tiers with dust accounting, and the
    // combined cancel+withdrawal+order race from the full spec (only the
    // hold-vs-hold race is exercised here).
    {
      desc: "Challenge 04: Settlement, Holds and Atomicity > Challenge 4a: Holds > Challenge 4a-1: a deposit increases available, a hold moves it to held without touching the total",
      score: 12,
    },
    {
      desc: "Challenge 04: Settlement, Holds and Atomicity > Challenge 4a: Holds > Challenge 4a-2: a hold exceeding available is rejected, and the balance is unchanged",
      score: 12,
    },
    {
      desc: "Challenge 04: Settlement, Holds and Atomicity > Challenge 4a: Holds > Challenge 4a-3: releasing exactly what was held restores available, and cannot release more than is held",
      score: 14,
    },
    {
      desc: "Challenge 04: Settlement, Holds and Atomicity > Challenge 4a: Holds > Challenge 4a-4: 100-way concurrent holds against 40 available succeed exactly 40 times, and the final split is exact",
      score: 22,
    },
    {
      desc: "Challenge 04: Settlement, Holds and Atomicity > Challenge 4b: Idempotency > Challenge 4b-1: replaying a deposit with the same Idempotency-Key applies it exactly once",
      score: 14,
    },
    {
      desc: "Challenge 04: Settlement, Holds and Atomicity > Challenge 4b: Idempotency > Challenge 4b-2: the same Idempotency-Key with a different body is a conflict, not a silent second effect",
      score: 12,
    },
    {
      desc: "Challenge 04: Settlement, Holds and Atomicity > Challenge 4b: Idempotency > Challenge 4b-3: withdrawal is idempotent and can only draw on available, never held",
      score: 14,
    },
    {
      desc: "Challenge 04: Settlement, Holds and Atomicity > Challenge 4c: Atomic trade settlement > Challenge 4c-1: settling a trade moves both legs atomically, and posts a balanced ledger entry",
      score: 18,
    },
    {
      desc: "Challenge 04: Settlement, Holds and Atomicity > Challenge 4c: Atomic trade settlement > Challenge 4c-2: a trade that would overdraw a hold is rejected and leaves every balance untouched",
      score: 12,
    },

    // Challenge 05: Pre-Trade Risk and Limits — 90/140. Not covered: margin
    // computation, mark-to-market, and below-maintenance order restriction.
    {
      desc: "Challenge 05: Pre-Trade Risk and Limits > Challenge 5a: Individual rules > Challenge 5a-1: an order whose notional exceeds the account's limit is rejected before it ever reaches the book",
      score: 14,
    },
    {
      desc: "Challenge 05: Pre-Trade Risk and Limits > Challenge 5a: Individual rules > Challenge 5a-2: an account cannot have more resting orders open than its limit",
      score: 14,
    },
    {
      desc: "Challenge 05: Pre-Trade Risk and Limits > Challenge 5a: Individual rules > Challenge 5a-3: committed exposure beyond the position limit is rejected",
      score: 14,
    },
    {
      desc: "Challenge 05: Pre-Trade Risk and Limits > Challenge 5a: Individual rules > Challenge 5a-4: cancelling a resting order releases both its open-order slot and its exposure",
      score: 12,
    },
    {
      desc: "Challenge 05: Pre-Trade Risk and Limits > Challenge 5b: Deterministic precedence > Challenge 5b-1: when an order violates both the notional and the open-order limit, the notional violation is reported",
      score: 12,
    },
    {
      desc: "Challenge 05: Pre-Trade Risk and Limits > Challenge 5c: Concurrent joint-limit enforcement > Challenge 5c-1: of two orders each individually within the position limit but jointly over it, submitted in parallel, exactly one is accepted",
      score: 16,
    },
    {
      desc: "Challenge 05: Pre-Trade Risk and Limits > Challenge 5d: Kill switch > Challenge 5d-1: once engaged, new orders are rejected but cancellation still works",
      score: 8,
    },

    // Challenge 06: Event Sourcing and Deterministic Replay — 89/100. This
    // slice event-sources one commutative projection (deposit sums), not
    // every domain's state (ledger/matching/settlement are not
    // event-sourced), and does not cover replay performance at 200k events.
    {
      desc: "Challenge 06: Event Sourcing and Deterministic Replay > Challenge 6a: Chain integrity > Challenge 6a-1: every appended event chains its hash to its predecessor's",
      score: 12,
    },
    {
      desc: "Challenge 06: Event Sourcing and Deterministic Replay > Challenge 6a: Chain integrity > Challenge 6a-2: tampering with a historical event's amount is detected, and the first broken link is reported",
      score: 16,
    },
    {
      desc: "Challenge 06: Event Sourcing and Deterministic Replay > Challenge 6b: Rebuild fidelity > Challenge 6b-1: rebuilding from the full event log matches the live projection after a randomised sequence of deposits",
      score: 13,
    },
    {
      desc: "Challenge 06: Event Sourcing and Deterministic Replay > Challenge 6b: Rebuild fidelity > Challenge 6b-2: snapshot plus tail replay equals a full replay from the log",
      score: 13,
    },
    {
      desc: "Challenge 06: Event Sourcing and Deterministic Replay > Challenge 6b: Rebuild fidelity > Challenge 6b-3: state-at-sequence for an arbitrary earlier point excludes later events",
      score: 11,
    },
    {
      desc: "Challenge 06: Event Sourcing and Deterministic Replay > Challenge 6c: Idempotent and order-tolerant replay (pure reducer) > Challenge 6c-1: property — replaying a randomly duplicated and shuffled event list yields the same balances as the deduplicated original",
      score: 15,
    },
    {
      desc: "Challenge 06: Event Sourcing and Deterministic Replay > Challenge 6d: Sequencing > Challenge 6d-1: event sequence numbers are strictly increasing with no gaps",
      score: 9,
    },

    // Challenge 07: The Adversarial Gauntlet — 70/200. Covers 5 of the 12
    // spec categories (injection, mass assignment, prototype pollution,
    // payload abuse, headers/disclosure). Not covered: tenant isolation,
    // privilege escalation, password reset, rate limiting, audit logging,
    // export injection — none of those features exist yet to attack.
    {
      desc: "Challenge 07: The Adversarial Gauntlet > Challenge 7a: Injection > Challenge 7a-1: SQL metacharacters through every string field are treated as literal data, never executed",
      score: 9,
    },
    {
      desc: "Challenge 07: The Adversarial Gauntlet > Challenge 7a: Injection > Challenge 7a-2: SQL metacharacters through a route parameter do not error and do not match a real account",
      score: 9,
    },
    {
      desc: "Challenge 07: The Adversarial Gauntlet > Challenge 7b: Mass assignment > Challenge 7b-1: unexpected privileged fields in a signup-shaped body are ignored, not applied",
      score: 9,
    },
    {
      desc: "Challenge 07: The Adversarial Gauntlet > Challenge 7c: Prototype pollution > Challenge 7c-1: a __proto__ key in the request body never reaches Object.prototype",
      score: 9,
    },
    {
      desc: "Challenge 07: The Adversarial Gauntlet > Challenge 7e: Security headers and disclosure > Challenge 7e-2: an internal error never leaks a stack trace or a file path in the response body",
      score: 8,
    },

    // Challenge 08: Market Data, Calendars and Time — 80/80. Covers OHLCV
    // aggregation at all four spec'd resolutions (1m/5m/1h/1d) on
    // randomised, sequence-shuffled trades, hierarchical consistency,
    // empty-bucket carry-forward, VWAP and late-arriving-trade
    // rebucketing, all in fixed UTC buckets. Market-timezone bucketing
    // across DST and exchange calendars/sessions are out of scope by
    // design (see the product spec's Challenge 08 section) — not gaps,
    // deliberate scope trims.
    // The per-test weights partly re-cut the product spec's requirement table (20/15/15/15/15): the HTTP-surface
    // test (8e) carves points out of the other rows, while the total stays 80.
    {
      desc: "Challenge 08: Market Data, Calendars and Time > Challenge 8a: OHLCV correctness > Challenge 8a-1: open and close are taken by arrival sequence, not by timestamp collision order",
      score: 10,
    },
    {
      desc: "Challenge 08: Market Data, Calendars and Time > Challenge 8a: OHLCV correctness > Challenge 8a-2: property — high is always the maximum trade price and low the minimum, for any trade set in one bucket",
      score: 4,
    },
    {
      desc: "Challenge 08: Market Data, Calendars and Time > Challenge 8a: OHLCV correctness > Challenge 8a-3: property — on randomised trades spanning many buckets, candles at 1m, 5m, 1h and 1d match an independent oracle",
      score: 6,
    },
    {
      desc: "Challenge 08: Market Data, Calendars and Time > Challenge 8b: Hierarchical consistency > Challenge 8b-1: rolling up every 1-minute candle in an hour reproduces the 1-hour candle's volume, high and low",
      score: 12,
    },
    {
      desc: "Challenge 08: Market Data, Calendars and Time > Challenge 8c: Empty buckets > Challenge 8c-1: a gap between trades is filled with the previous close, never a fabricated zero and never omitted",
      score: 10,
    },
    {
      desc: "Challenge 08: Market Data, Calendars and Time > Challenge 8d: VWAP > Challenge 8d-1: VWAP is exact, with the discarded remainder reported rather than dropped",
      score: 10,
    },
    {
      desc: "Challenge 08: Market Data, Calendars and Time > Challenge 8d: VWAP > Challenge 8d-2: VWAP over an empty trade set is zero, not NaN or an error",
      score: 7,
    },
    {
      desc: "Challenge 08: Market Data, Calendars and Time > Challenge 8e: HTTP surface > Challenge 8e-1: the candles endpoint aggregates and serialises correctly end to end",
      score: 6,
    },
    {
      desc: "Challenge 08: Market Data, Calendars and Time > Challenge 8f: Late-arriving trades > Challenge 8f-1: a trade arriving late with an earlier timestamp still rebuckets correctly at every resolution",
      score: 15,
    },

    // Challenge 09: Reconciliation, Reporting and Migration — 45/100. The
    // trial-balance reconciliation reuses Challenge 02's real endpoint; the
    // migration is a single non-destructive, idempotent, reversible
    // backfill. Not covered: the daily per-market report, point-in-time
    // export consistency under concurrent trading, and a full dirty-dataset
    // migration with quarantined unresolvable rows.
    {
      desc: "Challenge 09: Reconciliation, Reporting and Migration > Challenge 9a: The trial balance proves the ledger > Challenge 9a-1: the trial balance sums to zero per asset after a randomised sequence of balanced entries",
      score: 14,
    },
    {
      desc: "Challenge 09: Reconciliation, Reporting and Migration > Challenge 9a: The trial balance proves the ledger > Challenge 9a-2: an empty ledger reconciles trivially — no accounts, no imbalance",
      score: 8,
    },

    // Challenge 10: Observability and Operations — 100/100. Health/ready
    // probes, structured request logging with no secret leakage, a metrics
    // snapshot, and fixed-window rate limiting on the auth/orders routes.
    {
      desc: "Challenge 10: Observability and Operations > Challenge 10a: Health and readiness > Challenge 10a-1: /health always answers 200 while the process is running",
      score: 10,
    },
    {
      desc: "Challenge 10: Observability and Operations > Challenge 10a: Health and readiness > Challenge 10a-2: /ready answers 200 when the database is reachable",
      score: 8,
    },
    {
      desc: "Challenge 10: Observability and Operations > Challenge 10a: Health and readiness > Challenge 10a-3: /ready answers 503 when the database is unreachable",
      score: 7,
    },
    {
      desc: "Challenge 10: Observability and Operations > Challenge 10b: Structured logging with no secrets > Challenge 10b-1: a request never causes a password, token or full body to reach stdout",
      score: 25,
    },
    {
      desc: "Challenge 10: Observability and Operations > Challenge 10b: Structured logging with no secrets > Challenge 10b-2: a request produces at least one structured log line with the expected fields",
      score: 20,
    },
    {
      desc: "Challenge 10: Observability and Operations > Challenge 10c: Metrics > Challenge 10c-1: /api/metrics reflects real traffic already served",
      score: 15,
    },
    {
      desc: "Challenge 10: Observability and Operations > Challenge 10d: Rate limiting > Challenge 10d-1: exceeding the login rate limit returns 429 with Retry-After",
      score: 10,
    },
    {
      desc: "Challenge 10: Observability and Operations > Challenge 10d: Rate limiting > Challenge 10d-2: after the window resets, a request that was previously rate-limited succeeds again",
      score: 5,
    },

    // Challenge 11: API Design and Performance — 90/90. A consistent
    // { data, meta } / { error: { code, details } } envelope across a
    // broadened route sample, a correctly invalidated read-through cache
    // on a dedicated config resource, URL-versioned routing that 404s
    // cleanly on an unknown version instead of silently falling back, and
    // a latency budget enforced under repeated load on a representative
    // read-only route. Not covered: a formal API deprecation policy.
    {
      desc: "Challenge 11: API Design and Performance > Challenge 11a: Response envelope consistency > Challenge 11a-1: a representative success response from every route family matches the { data, meta } envelope",
      score: 12,
    },
    {
      desc: "Challenge 11: API Design and Performance > Challenge 11b: Cache correctness > Challenge 11b-1: a first read is a cache miss and a second identical read is a cache hit",
      score: 18,
    },
    {
      desc: "Challenge 11: API Design and Performance > Challenge 11b: Cache correctness > Challenge 11b-2: a write invalidates the cache — the very next read reflects it, not the stale value",
      score: 17,
    },

    // Challenge 12: Operator Dashboard — 130/130. Balance, order-book and
    // risk-state rendering from real data, literal-text rendering of
    // untrusted names, distinguishable loading/empty/error states
    // (including a genuinely empty order book, not just an empty
    // balance list), and a client-side request builder that carries the
    // same HMAC signature scheme Challenge 01 requires from any client.
    {
      desc: "Challenge 12: Operator Dashboard > Challenge 12a: Rendering real data > Challenge 12a-1: the balance view renders one row per asset with available, held and total",
      score: 10,
    },
    {
      desc: "Challenge 12: Operator Dashboard > Challenge 12a: Rendering real data > Challenge 12a-2: the order book view highlights the best bid and best ask",
      score: 10,
    },
    {
      desc: "Challenge 12: Operator Dashboard > Challenge 12a: Rendering real data > Challenge 12a-3: the risk view shows open order count and committed exposure",
      score: 10,
    },
    {
      desc: "Challenge 12: Operator Dashboard > Challenge 12b: Untrusted data never executes > Challenge 12b-1: an asset name containing markup renders as literal text, not as an element",
      score: 20,
    },
    {
      desc: "Challenge 12: Operator Dashboard > Challenge 12c: Distinguishable loading, empty and error states > Challenge 12c-1: an empty balance list renders a distinct empty state, not an empty table",
      score: 2,
    },
    {
      desc: "Challenge 12: Operator Dashboard > Challenge 12c: Distinguishable loading, empty and error states > Challenge 12c-2: rendered data marks the section ready, distinct from empty or loading",
      score: 2,
    },
    {
      desc: "Challenge 12: Operator Dashboard > Challenge 12c: Distinguishable loading, empty and error states > Challenge 12c-3: a loading state is visibly distinct from empty, error and ready",
      score: 2,
    },
    {
      desc: "Challenge 12: Operator Dashboard > Challenge 12c: Distinguishable loading, empty and error states > Challenge 12c-4: an error state is visibly distinct from empty, loading and ready",
      score: 2,
    },
    {
      desc: "Challenge 12: Operator Dashboard > Challenge 12c: Distinguishable loading, empty and error states > Challenge 12c-5: an empty order book renders a distinct empty state, not empty columns",
      score: 2,
    },
    {
      desc: 'Challenge 12: Operator Dashboard > Challenge 12d: Client-side HMAC signing > Challenge 12d-1: the built request carries the signature, timestamp and nonce the server expects',
      score: 10,
    },
    {
      desc: 'Challenge 12: Operator Dashboard > Challenge 12d: Client-side HMAC signing > Challenge 12d-2: a request with no body signs an undefined rawBody, not the string "undefined"',
      score: 10,
    },
    {
      desc: "Challenge 12: Operator Dashboard > Challenge 12e: Exact money formatting > Challenge 12e-1: formatMinorUnits matches an exact BigInt oracle for any amount, sign, leading zeros and exponent",
      score: 12,
    },
    {
      desc: "Challenge 12: Operator Dashboard > Challenge 12e: Exact money formatting > Challenge 12e-2: small fractions, zero and exponent 0 format correctly, and malformed input throws RangeError",
      score: 8,
    },
    {
      desc: "Challenge 12: Operator Dashboard > Challenge 12f: Order book presentation > Challenge 12f-1: each side renders best price first whatever order the API returns, with only the first row marked best",
      score: 12,
    },
    {
      desc: "Challenge 12: Operator Dashboard > Challenge 12f: Order book presentation > Challenge 12f-2: a deep book is capped at ten levels with a '+N more' row, and malformed prices never break the render",
      score: 8,
    },
    {
      desc: "Challenge 12: Operator Dashboard > Challenge 12g: Accessibility > Challenge 12g-1: loading sets aria-busy, errors announce themselves with role=alert, and tables have a caption and column headers",
      score: 10,
    },

    // Challenge 13: The Extension Round — 100/100. The amendment is account
    // closure: a closed account rejects deposit, withdrawal, hold and order
    // placement, and closing itself requires every balance to already be
    // zero. 10a-10c pay the 40 points for the amendment's own tests; 10d's
    // two direct regression checks, together with every other test file in
    // this repo still passing unmodified, pay the 60 points for Challenges
    // 01-09 surviving the change.
    {
      desc: "Challenge 13: The Extension Round — Account Closure > Challenge 13a: Closing requires a zero balance > Challenge 13a-1: an account with a nonzero available balance cannot be closed",
      score: 5,
    },
    {
      desc: "Challenge 13: The Extension Round — Account Closure > Challenge 13a: Closing requires a zero balance > Challenge 13a-2: an account with a nonzero held balance cannot be closed either",
      score: 5,
    },
    {
      desc: "Challenge 13: The Extension Round — Account Closure > Challenge 13a: Closing requires a zero balance > Challenge 13a-3: an account with every balance at exactly zero closes successfully",
      score: 6,
    },
    {
      desc: "Challenge 13: The Extension Round — Account Closure > Challenge 13a: Closing requires a zero balance > Challenge 13a-4: a freshly opened account with no balance activity at all closes successfully",
      score: 4,
    },
    {
      desc: "Challenge 13: The Extension Round — Account Closure > Challenge 13b: A closed account rejects every balance-moving operation > Challenge 13b-1: deposit, withdrawal and hold are all rejected once closed, and no balance moves",
      score: 6,
    },
    {
      desc: "Challenge 13: The Extension Round — Account Closure > Challenge 13b: A closed account rejects every balance-moving operation > Challenge 13b-2: a trade touching any one of the four accounts is rejected atomically, and none of the four balances move",
      score: 6,
    },
    {
      desc: "Challenge 13: The Extension Round — Account Closure > Challenge 13c: A closed account cannot place new orders > Challenge 13c-1: a registered account that has been closed is rejected when it tries to place an order",
      score: 5,
    },
    {
      desc: "Challenge 13: The Extension Round — Account Closure > Challenge 13c: A closed account cannot place new orders > Challenge 13c-2: an unregistered account id — never created through the ledger — is unaffected by closure semantics and still trades normally",
      score: 3,
    },
    {
      desc: "Challenge 13: The Extension Round — Account Closure > Challenge 13d: Challenges 01–12 are unaffected by the amendment > Challenge 13d-1: a balanced ledger entry between two open accounts still posts, and the trial balance still proves zero",
      score: 30,
    },
    {
      desc: "Challenge 13: The Extension Round — Account Closure > Challenge 13d: Challenges 01–12 are unaffected by the amendment > Challenge 13d-2: a hold-then-release cycle on a still-open account is unaffected",
      score: 30,
    },
    // Challenge 14: Netting and Multilateral Settlement — 200/200. Minimality is checked against
    // an independent brute-force oracle; 14e is the scale floor (planted pairs and triples).
    {
      desc: "Challenge 14: Netting and Multilateral Settlement > Challenge 14a: Net positions are preserved > Challenge 14a-1: applying the transfers reproduces every account's net position exactly, per asset",
      score: 15,
    },
    {
      desc: "Challenge 14: Netting and Multilateral Settlement > Challenge 14a: Net positions are preserved > Challenge 14a-2: transfers are well formed, and only net debtors pay and only net creditors receive",
      score: 15,
    },
    {
      desc: "Challenge 14: Netting and Multilateral Settlement > Challenge 14b: Cycles cancel > Challenge 14b-1: a cycle of equal obligations of any length contributes no transfer at all",
      score: 25,
    },
    {
      desc: "Challenge 14: Netting and Multilateral Settlement > Challenge 14c: The transfer count is the minimum > Challenge 14c-1: the number of transfers equals the brute-force minimum, on batches with planted zero-sum groups",
      score: 60,
    },
    {
      desc: "Challenge 14: Netting and Multilateral Settlement > Challenge 14d: Assets and ordering > Challenge 14d-1: assets are netted independently — the combined result is the per-asset results together",
      score: 20,
    },
    {
      desc: "Challenge 14: Netting and Multilateral Settlement > Challenge 14d: Assets and ordering > Challenge 14d-2: the result is identical for any input order and for any splitting of an obligation",
      score: 20,
    },
    {
      desc: "Challenge 14: Netting and Multilateral Settlement > Challenge 14e: Scale > Challenge 14e-1: a large batch with thousands of planted pairs and triples is netted correctly within the time budget",
      score: 35,
    },
    {
      desc: "Challenge 14: Netting and Multilateral Settlement > Challenge 14f: Input validation > Challenge 14f-1: invalid obligations throw RangeError, and an empty batch nets to nothing",
      score: 10,
    },
    // Challenge 15: Complex Order Types — 200/200. Pure state-machine tests: every action list is
    // compared with an independent oracle replay of a random fill/price history.
    {
      desc: "Challenge 15: Complex Order Types > Challenge 15a: OCO (one cancels the other) > Challenge 15a-1: a triggered stop cancels the limit and sells exactly what is still unfilled, for any fill and price history",
      score: 25,
    },
    {
      desc: "Challenge 15: Complex Order Types > Challenge 15a: OCO (one cancels the other) > Challenge 15a-2: a partially filled take-profit leaves a smaller stop, and the stop fires only once",
      score: 10,
    },
    {
      desc: "Challenge 15: Complex Order Types > Challenge 15b: Bracket orders > Challenge 15b-1: exits always cover exactly the cumulative entry fill, and a stop-loss also cancels the unfilled entry",
      score: 45,
    },
    {
      desc: "Challenge 15: Complex Order Types > Challenge 15c: Iceberg orders > Challenge 15c-1: only one clip is live, clips replenish only when fully filled, never exceed the total, and keep the original sequence",
      score: 40,
    },
    {
      desc: "Challenge 15: Complex Order Types > Challenge 15d: Trailing stops > Challenge 15d-1: the stop only ever ratchets in the favourable direction and fires exactly once, matching an independent oracle",
      score: 35,
    },
    {
      desc: "Challenge 15: Complex Order Types > Challenge 15e: Redelivery, determinism and cancellation > Challenge 15e-1: a redelivered fill changes nothing, and the same event history always yields the same actions",
      score: 20,
    },
    {
      desc: "Challenge 15: Complex Order Types > Challenge 15e: Redelivery, determinism and cancellation > Challenge 15e-2: cancelling a parent cancels its live limit children, disarms its stops, stops replenishing, and is idempotent",
      score: 15,
    },
    {
      desc: "Challenge 15: Complex Order Types > Challenge 15f: Input validation > Challenge 15f-1: impossible orders and impossible fills throw RangeError",
      score: 10,
    },
    // Challenge 16: Fee and Rebate Engine — 200/200. Fees are checked against an independent exact
    // integer oracle (half-even, notionals beyond 2^53); 16e is the scale floor for the trailing window.
    {
      desc: "Challenge 16: Fee and Rebate Engine > Challenge 16a: Exact fee arithmetic > Challenge 16a-1: fees match an exact integer oracle for any notional, including those beyond 2^53, and rebates mirror fees",
      score: 30,
    },
    {
      desc: "Challenge 16: Fee and Rebate Engine > Challenge 16a: Exact fee arithmetic > Challenge 16a-2: an exact half rounds to the even integer, in both directions and for rebates",
      score: 25,
    },
    {
      desc: "Challenge 16: Fee and Rebate Engine > Challenge 16b: Volume tiers > Challenge 16b-1: each side's tier comes from its own trailing volume before the fill, matching an independent oracle",
      score: 45,
    },
    {
      desc: "Challenge 16: Fee and Rebate Engine > Challenge 16b: Volume tiers > Challenge 16b-2: a fill exactly one window old has expired from the trailing volume, one millisecond younger has not",
      score: 15,
    },
    {
      desc: "Challenge 16: Fee and Rebate Engine > Challenge 16c: Fees are posted as balanced ledger entries > Challenge 16c-1: every entry balances, fees and rebates flow the right way, and the fee account nets to the fees collected",
      score: 30,
    },
    {
      desc: "Challenge 16: Fee and Rebate Engine > Challenge 16d: Idempotency > Challenge 16d-1: a redelivered fill returns the original result and changes neither volume, tiers nor the timestamp clock",
      score: 20,
    },
    {
      desc: "Challenge 16: Fee and Rebate Engine > Challenge 16e: Scale > Challenge 16e-1: 200,000 fills with a wide trailing window are priced exactly and quickly",
      score: 25,
    },
    {
      desc: "Challenge 16: Fee and Rebate Engine > Challenge 16f: Input validation > Challenge 16f-1: invalid schedules, options and fills throw RangeError",
      score: 10,
    },
    // Challenge 17: Live Dashboard Updates — 150/150. The feed client is driven by a fake socket and a
    // virtual clock, so every reconnect delay and stale moment is asserted exactly.
    {
      desc: "Challenge 17: Live Dashboard Updates > Challenge 17a: Connection status > Challenge 17a-1: the feed reports connecting, live and stale at exactly the right moments, and never repeats a status",
      score: 20,
    },
    {
      desc: "Challenge 17: Live Dashboard Updates > Challenge 17b: Per-topic ordering > Challenge 17b-1: messages arriving shuffled and duplicated are delivered once each, in order, per topic",
      score: 25,
    },
    {
      desc: "Challenge 17: Live Dashboard Updates > Challenge 17b: Per-topic ordering > Challenge 17b-2: a gap that never fills triggers one resync for that topic only, and deltas are ignored until the next snapshot",
      score: 20,
    },
    {
      desc: "Challenge 17: Live Dashboard Updates > Challenge 17c: Reconnecting > Challenge 17c-1: reconnect delays follow the capped exponential backoff with jitter exactly, and reset once data flows again",
      score: 25,
    },
    {
      desc: "Challenge 17: Live Dashboard Updates > Challenge 17c: Reconnecting > Challenge 17c-2: a reconnect resubscribes from the last delivered seq, starts without a baseline, retries failed connects, and never reports stale while down",
      score: 15,
    },
    {
      desc: "Challenge 17: Live Dashboard Updates > Challenge 17d: Stopping > Challenge 17d-1: stop closes the socket once, cancels every timer, ignores late frames and never reconnects",
      score: 10,
    },
    {
      desc: "Challenge 17: Live Dashboard Updates > Challenge 17e: Applying order-book deltas > Challenge 17e-1: applying a delta stream matches an independent model, never mutates its input, and rejects invalid deltas",
      score: 15,
    },
    {
      desc: "Challenge 17: Live Dashboard Updates > Challenge 17f: The dashboard shows the connection state > Challenge 17f-1: stale and reconnecting keep the old data on screen with a note, live restores it, and loading/empty/error panels are left alone",
      score: 20,
    },
    // Challenge 18: The WebSocket Feed — 190/190.
    {
      desc: "Challenge 18: The WebSocket Feed > Challenge 18a: Handshake and subscriptions > Challenge 18a-1: only a valid token opens a connection; anything else is refused with 401 before the upgrade",
      score: 15,
    },
    {
      desc: "Challenge 18: The WebSocket Feed > Challenge 18a: Handshake and subscriptions > Challenge 18a-2: subscribing returns a snapshot per allowed topic, an error per forbidden or unknown one, and survives malformed messages",
      score: 20,
    },
    {
      desc: "Challenge 18: The WebSocket Feed > Challenge 18b: Ordered delivery > Challenge 18b-1: each topic has its own gapless, increasing sequence, and a late subscriber's snapshot joins it seamlessly",
      score: 30,
    },
    {
      desc: "Challenge 18: The WebSocket Feed > Challenge 18b: Ordered delivery > Challenge 18b-2: a resync request returns a fresh snapshot at the current sequence, and only for a subscribed topic",
      score: 15,
    },
    {
      desc: "Challenge 18: The WebSocket Feed > Challenge 18c: Liveness and backpressure > Challenge 18c-1: idle clients receive heartbeats, and a client that stops answering pings is dropped while a healthy one stays",
      score: 25,
    },
    {
      desc: "Challenge 18: The WebSocket Feed > Challenge 18c: Liveness and backpressure > Challenge 18c-2: a consumer that stops reading is cut loose instead of buffering without bound, and everyone else keeps receiving every message",
      score: 30,
    },
    {
      desc: "Challenge 18: The WebSocket Feed > Challenge 18d: Shutdown > Challenge 18d-1: disconnectAll drops every client with 1012 and keeps accepting new ones; close ends everything with 1001",
      score: 15,
    },
    {
      desc: "Challenge 18: The WebSocket Feed > Challenge 18e: Fan-out > Challenge 18e-1: thirty subscribers each receive a hundred rapid publishes complete and in order",
      score: 20,
    },
    {
      desc: "Challenge 18: The WebSocket Feed > Challenge 18f: Book deltas > Challenge 18f-1: diffDepth returns exactly the changed levels, with quantity 0 for removed ones, so applying them rebuilds the new book",
      score: 20,
    },
    // Challenge 19: API Documentation — 185/185.
    {
      desc: "Challenge 19: API Documentation > Challenge 19a: A valid OpenAPI document > Challenge 19a-1: GET /api/openapi.json serves an OpenAPI 3 document with a title, a version and a server",
      score: 10,
    },
    {
      desc: "Challenge 19: API Documentation > Challenge 19a: A valid OpenAPI document > Challenge 19a-2: the document passes a real OpenAPI validator, including every $ref",
      score: 20,
    },
    {
      desc: "Challenge 19: API Documentation > Challenge 19b: Coverage and accuracy > Challenge 19b-1: every operation the API serves is documented under its exact path template",
      score: 25,
    },
    {
      desc: "Challenge 19: API Documentation > Challenge 19b: Coverage and accuracy > Challenge 19b-2: nothing is documented that the API does not serve",
      score: 15,
    },
    {
      desc: "Challenge 19: API Documentation > Challenge 19b: Coverage and accuracy > Challenge 19b-3: every operation has a real summary, a tag, a unique operationId, a success response and its path parameters declared",
      score: 20,
    },
    {
      desc: "Challenge 19: API Documentation > Challenge 19b: Coverage and accuracy > Challenge 19b-4: API operations document the standard error envelope through a shared component",
      score: 15,
    },
    {
      desc: "Challenge 19: API Documentation > Challenge 19c: Request and response schemas > Challenge 19c-1: request bodies describe their required fields, enums and integer-string amounts, and idempotent calls declare Idempotency-Key",
      score: 30,
    },
    {
      desc: "Challenge 19: API Documentation > Challenge 19c: Request and response schemas > Challenge 19c-2: the documented response schemas match what the API really returns",
      score: 25,
    },
    {
      desc: "Challenge 19: API Documentation > Challenge 19d: Swagger UI > Challenge 19d-1: GET /api/docs serves an HTML page that loads Swagger UI against the document",
      score: 10,
    },
    {
      desc: "Challenge 19: API Documentation > Challenge 19d: Swagger UI > Challenge 19d-2: the docs page relaxes the Content-Security-Policy just enough to run, while every other route stays locked down",
      score: 15,
    },
    // Challenge 20: Dashboard and Demo Data — 160/160.
    {
      desc: "Challenge 20: Dashboard and Demo Data > Challenge 20a: Initial data > Challenge 20a-1: running the demo seed creates at least five funded trading accounts, each holding at least two known assets",
      score: 15,
    },
    {
      desc: "Challenge 20: Dashboard and Demo Data > Challenge 20a: Initial data > Challenge 20a-2: the initial funding is double-entry: every entry balances, the ledger sums to zero per asset, and postings agree with the stored balances",
      score: 25,
    },
    {
      desc: "Challenge 20: Dashboard and Demo Data > Challenge 20a: Initial data > Challenge 20a-3: running the seed again changes nothing",
      score: 15,
    },
    {
      desc: "Challenge 20: Dashboard and Demo Data > Challenge 20b: The accounts API > Challenge 20b-1: GET /api/ledger/accounts lists every account with its balances, sorted by name",
      score: 25,
    },
    {
      desc: "Challenge 20: Dashboard and Demo Data > Challenge 20c: An informative dashboard > Challenge 20c-1: the account list shows every account by name with exact, exponent-aware holdings and a status badge",
      score: 20,
    },
    {
      desc: "Challenge 20: Dashboard and Demo Data > Challenge 20c: An informative dashboard > Challenge 20c-2: the portfolio summary counts the accounts and adds each asset up exactly across all of them",
      score: 25,
    },
    {
      desc: "Challenge 20: Dashboard and Demo Data > Challenge 20c: An informative dashboard > Challenge 20c-3: risk usage shows how much of each limit is used, with a meter that turns to warning at 80% and danger at 100%",
      score: 20,
    },
    {
      desc: "Challenge 20: Dashboard and Demo Data > Challenge 20c: An informative dashboard > Challenge 20c-4: recent trades lists at most ten, newest first, each with its exact notional, and says so when there are none",
      score: 15,
    },
    // Challenge 21: Integration — 150/150.
    {
      desc: "Challenge 21: Integration > Challenge 21a: The live order book > Challenge 21a-1: the book rebuilt from the WebSocket feed always equals the depth endpoint, with a gapless sequence",
      score: 40,
    },
    {
      desc: "Challenge 21: Integration > Challenge 21a: The live order book > Challenge 21a-2: when the server drops every connection the client reconnects, resynchronises from a snapshot and catches up",
      score: 40,
    },
    {
      desc: "Challenge 21: Integration > Challenge 21b: From trades to settlement > Challenge 21b-1: trades taken from the API net down without changing anyone's position, and their fees balance exactly",
      score: 40,
    },
    {
      desc: "Challenge 21: Integration > Challenge 21c: The dashboard on real data > Challenge 21c-1: after the demo seed and some trading, the dashboard's summary, account list and recent trades agree with the API and the database",
      score: 30,
    },
  ],
};
