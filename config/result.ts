import { request } from "https";
import xml2js from "xml2js";
import fs from "fs";
import { scores, type ScoreEntry } from "./scores.js";

const UNIT_TEST_RESULT_PATH = "../test-results.xml";

// Shape produced by xml2js for the vitest JUnit reporter's output. Attributes
// land under `$`; a repeated child element (even a single `<skipped/>`) is
// parsed as an array by xml2js's default `explicitArray` behavior, which is
// exactly what the `failure`/`skipped` presence checks below rely on.
interface JUnitTestCase {
  $: { name: string; time?: string; classname?: string };
  failure?: unknown[];
  skipped?: unknown[];
}

interface JUnitTestSuite {
  $: { name: string; tests: string; failures: string; errors: string; skipped?: string; time: string };
  testcase?: JUnitTestCase[];
}

interface JUnitTestSuites {
  testsuites: {
    $: { name: string; tests: string; failures: string; errors: string; time: string };
    testsuite: JUnitTestSuite[];
  };
}

const getXMLData = (): string => {
  return fs.readFileSync(UNIT_TEST_RESULT_PATH, "utf8");
};

const testResultsToJson = (xmlData: string): Promise<JUnitTestSuites> => {
  const parser = new xml2js.Parser();
  // parseStringPromise resolves with `any` per @types/xml2js; the shape is
  // fixed by the vitest JUnit reporter that produced this file, so it is
  // annotated here rather than propagated as `any`.
  return parser.parseStringPromise(xmlData) as Promise<JUnitTestSuites>;
};

const getJsonTestResults = async (): Promise<JUnitTestSuites> => {
  const xmlData = getXMLData();
  return testResultsToJson(xmlData);
};

interface GradedTestCase {
  fullName: string | undefined;
  success: boolean;
  score: number;
}

interface ReportSummary {
  date: Date;
  tests: string;
  failures: string;
}

interface ReportPayload {
  repoName: string | undefined;
  summary: ReportSummary;
  bugFixing: GradedTestCase[];
  featureImplementation: GradedTestCase[];
}

const CHALLENGE_MARKER = "Challenge";

const challengeName = (fullTestName: string): string | undefined => {
  const index = fullTestName.indexOf(CHALLENGE_MARKER);
  return index === -1 ? undefined : fullTestName.slice(index);
};

const findScoreEntry = (entries: ScoreEntry[], testName: string): ScoreEntry | undefined => entries.find((entry) => entry.desc === testName);

const postData = async (): Promise<ReportPayload> => {
  const repoName = process.env.CODE_COMMIT_REPO;
  const unitTest = await getJsonTestResults();
  const { tests, failures } = unitTest.testsuites.$;

  const summary: ReportSummary = {
    date: new Date(),
    tests,
    failures,
  };

  const testSuites = unitTest.testsuites.testsuite;
  const bugFixing: GradedTestCase[] = [];
  const featureImplementation: GradedTestCase[] = [];

  for (const testSuite of testSuites) {
    const currentTestCases = testSuite.testcase ?? [];

    for (const testCase of currentTestCases) {
      const fullName = challengeName(testCase.$.name);
      const success = !testCase.failure && !testCase.skipped;

      const bugEntry = findScoreEntry(scores.bugs, testCase.$.name);
      if (bugEntry) {
        bugFixing.push({ fullName, success, score: bugEntry.score });
        continue;
      }

      const featureEntry = findScoreEntry(scores.features, testCase.$.name);
      if (featureEntry) {
        featureImplementation.push({ fullName, success, score: featureEntry.score });
      }
    }
  }

  return {
    repoName,
    summary,
    bugFixing,
    featureImplementation,
  };
};

const sendReportData = async (): Promise<void> => {
  const data = await postData();
  console.log(data);
  const body = JSON.stringify(data);
  const options = {
    hostname: "app.devgrade.io",
    path: "/assessments/report",
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Content-Length": Buffer.byteLength(body),
    },
  };

  const req = request(options, () => {});
  req.write(body);
  req.end();
};

sendReportData();
