import type { Knex } from "knex";

// Every challenge's tests generate their own data at run time, from a
// fresh random seed on every run (see DEVQUEST_2026_CLEARHOUSE_CHALLENGES.md's
// "Global conventions") — there is no fixture data to seed here. This file
// exists only so `db/seeds/` is a real, non-empty directory: `db.seed.run()`
// (called from tests/testBase.ts before every test) throws ENOENT against a
// missing directory, even though it happily runs zero seed files against an
// existing, empty one.
export async function seed(_knex: Knex): Promise<void> {}
