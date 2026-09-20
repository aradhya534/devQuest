// Grading test runner. Runs every tests/*.test.ts file in its own Vitest process, several at a time, with a
// wall-clock limit per file, then merges the per-file JUnit reports into ../test-results.xml for result.ts.
//
// Why not just `npm test`? A single Vitest process writes its report only when it finishes. One candidate
// file that loops forever (a synchronous infinite loop cannot be interrupted by a test timeout) or one very
// slow run would then produce no report at all and nobody would get any marks. Here a hung file is killed
// after FILE_TIMEOUT_MS, its tests simply score nothing, and every other file is still graded.
//
// Usage (from the repository root or from config/):  node config/run-tests.mjs
// Environment: RUN_TESTS_FILE_TIMEOUT_MS (default 480000), RUN_TESTS_CONCURRENCY (default 3).

import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const testsDir = path.join(root, "tests");
const outDir = path.join(root, ".test-results");
const finalReport = path.join(root, "test-results.xml");
const vitestBin = path.join(root, "node_modules", "vitest", "vitest.mjs");

const FILE_TIMEOUT_MS = Number(process.env.RUN_TESTS_FILE_TIMEOUT_MS ?? 480_000);
const CONCURRENCY = Math.max(1, Number(process.env.RUN_TESTS_CONCURRENCY ?? Math.min(3, Math.max(2, os.availableParallelism()))));

const files = fs
  .readdirSync(testsDir)
  .filter((name) => name.endsWith(".test.ts"))
  .sort();

fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });
fs.rmSync(finalReport, { force: true });

function killTree(child) {
  if (child.pid === undefined) return;
  if (process.platform === "win32") {
    spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore" });
  } else {
    try {
      process.kill(-child.pid, "SIGKILL");
    } catch {
      child.kill("SIGKILL");
    }
  }
}

function runOne(file) {
  return new Promise((resolve) => {
    const report = path.join(outDir, `${file}.xml`);
    const started = Date.now();
    const child = spawn(process.execPath, [vitestBin, "run", `tests/${file}`], {
      cwd: root,
      env: { ...process.env, VITEST_JUNIT_FILE: report },
      detached: process.platform !== "win32",
      stdio: ["ignore", "pipe", "pipe"],
    });

    let log = "";
    child.stdout.on("data", (chunk) => (log += chunk));
    child.stderr.on("data", (chunk) => (log += chunk));

    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      killTree(child);
    }, FILE_TIMEOUT_MS);

    child.on("close", (code) => {
      clearTimeout(timer);
      const seconds = ((Date.now() - started) / 1000).toFixed(0);
      const haveReport = fs.existsSync(report);
      const status = timedOut ? `KILLED after ${seconds}s (hung or too slow; its tests score nothing)` : code === 0 ? `passed (${seconds}s)` : `finished with failures (${seconds}s)`;
      console.log(`[run-tests] ${file}: ${status}${haveReport ? "" : " - no report written"}`);
      if (timedOut || !haveReport) console.log(log.split("\n").slice(-15).join("\n"));
      resolve({ file, report: haveReport ? report : null });
    });
  });
}

const queue = [...files];
const results = [];
await Promise.all(
  Array.from({ length: Math.min(CONCURRENCY, queue.length) }, async () => {
    while (queue.length > 0) {
      const file = queue.shift();
      results.push(await runOne(file));
    }
  }),
);

// Merge: keep every <testsuite> block and rebuild the root element's totals.
let suites = "";
let tests = 0;
let failures = 0;
let errors = 0;
let time = 0;
for (const { report } of results.sort((a, b) => a.file.localeCompare(b.file))) {
  if (!report) continue;
  const xml = fs.readFileSync(report, "utf8");
  const root_ = xml.match(/<testsuites\b([^>]*)>/);
  if (!root_) continue;
  const attr = (name) => Number((root_[1].match(new RegExp(`\\b${name}="([^"]*)"`)) ?? [])[1] ?? 0);
  tests += attr("tests");
  failures += attr("failures");
  errors += attr("errors");
  time += attr("time");
  const inner = xml.slice(xml.indexOf(">", xml.indexOf("<testsuites")) + 1, xml.lastIndexOf("</testsuites>"));
  suites += inner.trim() + "\n";
}

if (suites === "") {
  console.error("[run-tests] no test report was produced by any file");
  process.exit(1);
}

fs.writeFileSync(finalReport, `<?xml version="1.0" encoding="UTF-8" ?>\n<testsuites name="vitest tests" tests="${tests}" failures="${failures}" errors="${errors}" time="${time}">\n${suites}</testsuites>\n`);
fs.rmSync(outDir, { recursive: true, force: true });
console.log(`[run-tests] merged ${results.filter((r) => r.report).length}/${results.length} reports: ${tests} tests, ${failures} failures -> ${finalReport}`);
// Like `npm test`: a non-zero exit when anything failed (the buildspec records the repo, then carries on to scoring).
process.exit(failures + errors > 0 ? 1 : 0);
