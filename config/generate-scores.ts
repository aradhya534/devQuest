// Prints ready-to-paste config/scores.ts entries for one test file, with the
// exact JUnit testcase name for each `it`/`test`, scoped to keep the score
// table from drifting out of sync with the tests it grades (see the
// mismatch this replaced: every Challenge 01-17 entry in scores.js used to
// reference a name no test file produced, so nothing ever scored).
//
// Usage: npx tsx config/generate-scores.ts tests/challenge01.test.ts
//
// This is a scaffolding aid, not a source of truth: it cannot know how many
// points each test is worth, so it emits `score: 0` placeholders. Fill in
// real values, then paste the block into scores.ts. Re-run after editing the
// test file's names or nesting.

import fs from "fs";
import path from "path";

interface DescribeFrame {
  name: string;
  depth: number;
}

const target = process.argv[2];
if (!target) {
  console.error("Usage: npx tsx config/generate-scores.ts <path-to-test-file>");
  process.exit(1);
}

const absPath = path.resolve(process.cwd(), target);
const src = fs.readFileSync(absPath, "utf8");

// Tracks nested describe() blocks by matching brace depth, since a JUnit
// testcase name is the full describe chain joined with " > ".
const lines = src.split("\n");
const describeStack: DescribeFrame[] = [];
let depth = 0;
const entries: string[] = [];

for (const line of lines) {
  // Capture the opening quote character and require the *same* character to
  // close the string, so an apostrophe inside a double-quoted name (e.g.
  // "...the asset's own exponent") does not truncate the match.
  const describeMatch = line.match(/^\s*describe\(\s*(["'`])(.+?)\1/);
  const testMatch = line.match(/^\s*(?:it|test)(?:\.skip|\.only)?\(\s*(["'`])(.+?)\1/);

  if (describeMatch && describeMatch[2] !== undefined) {
    describeStack.push({ name: describeMatch[2], depth });
  }
  if (testMatch && testMatch[2] !== undefined) {
    const chain = [...describeStack.map((frame) => frame.name), testMatch[2]].join(" > ");
    entries.push(chain);
  }

  depth += (line.match(/{/g) ?? []).length;
  depth -= (line.match(/}/g) ?? []).length;

  while (describeStack.length > 0) {
    const top = describeStack[describeStack.length - 1];
    if (!top || depth > top.depth) break;
    describeStack.pop();
  }
}

if (entries.length === 0) {
  console.error(`No it()/test() cases found in ${target}`);
  process.exit(1);
}

console.log(`// Generated from ${target} — ${entries.length} test case(s).`);
console.log("// Fill in real point values before pasting into config/scores.ts.");
for (const desc of entries) {
  console.log("{");
  console.log(`    desc: ${JSON.stringify(desc)},`);
  console.log("    score: 0,");
  console.log("},");
}
