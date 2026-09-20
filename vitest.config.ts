import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    reporters: ["default", "junit"],
    // config/run-tests.mjs points each per-file run at its own report through this variable.
    outputFile: process.env.VITEST_JUNIT_FILE ?? "test-results.xml",
    watch: false,
    testTimeout: 10000,
    exclude: ["**/node_modules/**"],
    setupFiles: ["./tests/setup.ts"],
  },
});
