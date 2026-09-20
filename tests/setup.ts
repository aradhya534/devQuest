import { register } from "tsx/esm/api";

// knex loads db/migrations/*.ts and db/seeds/*.ts with a native import(), which plain Node cannot do for
// TypeScript before v22.18. Registering tsx makes that work on every supported Node version.
register();

import fc from "fast-check";

const seed = process.env.GRADING_SEED ? Number(process.env.GRADING_SEED) : Date.now();

fc.configureGlobal({ seed, endOnFailure: true, numRuns: 100 });

console.log(`fast-check seed: ${seed}`);
