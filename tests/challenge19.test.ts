import Ajv from "ajv";
import addFormats from "ajv-formats";
import SwaggerParser from "@apidevtools/swagger-parser";
import type { Agent } from "supertest";
import app from "../src/server.js";
import db from "../db/db-config.js";
import testBase from "./testBase.js";
import { expect, test, describe, beforeAll, afterAll } from "vitest";
import HttpStatus from "../src/enums/httpStatus.js";

let testSession: Agent;

beforeAll(async () => {
  testSession = testBase.createSuperTestSession(app);
  await testBase.resetDatabase(db);
});
afterAll(async () => {
  await new Promise<void>((resolve, reject) => {
    app.close((err) => (err ? reject(err) : resolve()));
  });
});

// Every operation the API serves (method, path template). Kept here so the document can be checked against
// the real routes rather than against itself.
const OPERATIONS: [string, string][] = [
  ["post", "/api/auth/login"], ["post", "/api/auth/refresh"],
  ["get", "/api/assets"], ["post", "/api/assets/validate"],
  ["post", "/api/secure/echo"],
  ["get", "/api/ledger/accounts"], ["post", "/api/ledger/accounts"], ["post", "/api/ledger/accounts/{accountId}/close"],
  ["get", "/api/ledger/accounts/{accountId}/balance"], ["get", "/api/ledger/accounts/{accountId}/statement"],
  ["post", "/api/ledger/entries"], ["post", "/api/ledger/entries/{entryId}/reverse"], ["get", "/api/ledger/trial-balance"],
  ["post", "/api/orders"], ["delete", "/api/orders/{orderId}"], ["patch", "/api/orders/{orderId}"], ["get", "/api/orders/trades"],
  ["get", "/api/orders/book/{market}"], ["get", "/api/orders/book/{market}/depth"],
  ["get", "/api/settlement/accounts/{accountId}/balance"], ["post", "/api/settlement/holds"], ["post", "/api/settlement/releases"],
  ["post", "/api/settlement/deposits"], ["post", "/api/settlement/withdrawals"], ["post", "/api/settlement/trades"],
  ["post", "/api/risk/limits"], ["get", "/api/risk/accounts/{accountId}/state"], ["post", "/api/risk/kill-switch"],
  ["post", "/api/events/deposits"], ["get", "/api/events/rebuild"], ["post", "/api/events/snapshots"], ["get", "/api/events/state"], ["get", "/api/events/verify"],
  ["post", "/api/market-data/candles"], ["post", "/api/market-data/vwap"],
  ["get", "/api/config/{key}"], ["put", "/api/config/{key}"],
  ["get", "/health"], ["get", "/ready"], ["get", "/api/metrics"],
];
const DOC_ROUTES: [string, string][] = [["get", "/api/openapi.json"], ["get", "/api/docs"]];

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

async function fetchDocument(): Promise<Json> {
  const response = await testSession.get("/api/openapi.json");
  expect(response.status).toBe(HttpStatus.OK);
  return response.body as Json;
}

function resolve(doc: Json, node: Json | undefined): Json {
  if (node && typeof node.$ref === "string") {
    return node.$ref
      .replace(/^#\//, "")
      .split("/")
      .reduce((current: Json, key: string) => current[key], doc);
  }
  return node ?? {};
}

function bodySchema(doc: Json, method: string, path: string): Json {
  const operation = doc.paths?.[path]?.[method];
  return resolve(doc, operation?.requestBody?.content?.["application/json"]?.schema);
}

describe("Challenge 19: API Documentation", () => {
  describe("Challenge 19a: A valid OpenAPI document", () => {
    test("Challenge 19a-1: GET /api/openapi.json serves an OpenAPI 3 document with a title, a version and a server", async () => {
      const response = await testSession.get("/api/openapi.json");
      expect(response.status).toBe(HttpStatus.OK);
      expect(response.headers["content-type"]).toMatch(/application\/json/);
      const doc = response.body as Json;
      expect(doc.openapi).toMatch(/^3\.(0|1)\.\d+$/);
      expect(typeof doc.info?.title).toBe("string");
      expect(doc.info.title.length).toBeGreaterThan(0);
      expect(typeof doc.info?.version).toBe("string");
      expect(doc.info.version.length).toBeGreaterThan(0);
      expect(Array.isArray(doc.servers) && doc.servers.length > 0).toBe(true);
    });

    test("Challenge 19a-2: the document passes a real OpenAPI validator, including every $ref", async () => {
      const doc = await fetchDocument();
      await expect(SwaggerParser.validate(JSON.parse(JSON.stringify(doc)))).resolves.toBeDefined();
    });
  });

  describe("Challenge 19b: Coverage and accuracy", () => {
    test("Challenge 19b-1: every operation the API serves is documented under its exact path template", async () => {
      const doc = await fetchDocument();
      const missing = OPERATIONS.filter(([method, path]) => !doc.paths?.[path]?.[method]).map(([m, p]) => `${m.toUpperCase()} ${p}`);
      expect(missing).toEqual([]);
    });

    test("Challenge 19b-2: nothing is documented that the API does not serve", async () => {
      const doc = await fetchDocument();
      const known = new Set([...OPERATIONS, ...DOC_ROUTES].map(([m, p]) => `${m} ${p}`));
      const extra: string[] = [];
      for (const [path, item] of Object.entries<Json>(doc.paths ?? {})) {
        for (const method of Object.keys(item)) {
          if (["get", "post", "put", "patch", "delete", "head", "options"].includes(method) && !known.has(`${method} ${path}`)) extra.push(`${method.toUpperCase()} ${path}`);
        }
      }
      expect(extra).toEqual([]);
      expect(Object.keys(doc.paths ?? {}).length).toBeGreaterThan(10);
    });

    test("Challenge 19b-3: every operation has a real summary, a tag, a unique operationId, a success response and its path parameters declared", async () => {
      const doc = await fetchDocument();
      const ids = new Set<string>();
      for (const [method, path] of OPERATIONS) {
        const operation = doc.paths?.[path]?.[method];
        expect(operation, `${method} ${path} is missing`).toBeDefined();
        expect(typeof operation.summary === "string" && operation.summary.trim().split(/\s+/).length >= 2, `${method} ${path} needs a descriptive summary`).toBe(true);
        expect(operation.summary.includes(path), `${method} ${path}: the summary must not just repeat the path`).toBe(false);
        expect(Array.isArray(operation.tags) && operation.tags.length > 0, `${method} ${path} needs a tag`).toBe(true);
        expect(typeof operation.operationId === "string" && operation.operationId.length > 0, `${method} ${path} needs an operationId`).toBe(true);
        expect(ids.has(operation.operationId), `duplicate operationId ${operation.operationId}`).toBe(false);
        ids.add(operation.operationId);
        expect(Object.keys(operation.responses ?? {}).some((code) => /^2\d\d$/.test(code)), `${method} ${path} needs a 2xx response`).toBe(true);

        for (const match of path.matchAll(/\{([A-Za-z]+)\}/g)) {
          const declared = (operation.parameters ?? []).find((p: Json) => p.name === match[1] && p.in === "path");
          expect(declared?.required, `${method} ${path}: path parameter ${match[1]} must be declared and required`).toBe(true);
        }
      }
    });

    test("Challenge 19b-4: API operations document the standard error envelope through a shared component", async () => {
      const doc = await fetchDocument();
      const envelope = doc.components?.schemas?.ErrorEnvelope;
      expect(envelope?.type).toBe("object");
      const error = resolve(doc, envelope?.properties?.error);
      expect(error.properties?.code?.type).toBe("string");
      expect(error.properties?.details?.type).toBe("array");

      for (const [method, path] of OPERATIONS.filter(([, p]) => p.startsWith("/api/") && !p.endsWith("/echo"))) {
        const responses = doc.paths[path][method].responses as Json;
        const errorCodes = Object.keys(responses).filter((code) => /^[45]\d\d$/.test(code));
        expect(errorCodes.length, `${method} ${path} documents no error response`).toBeGreaterThan(0);
        for (const code of errorCodes) {
          expect(responses[code].content?.["application/json"]?.schema?.$ref, `${method} ${path} ${code} should reference ErrorEnvelope`).toBe("#/components/schemas/ErrorEnvelope");
        }
      }
    });
  });

  describe("Challenge 19c: Request and response schemas", () => {
    test("Challenge 19c-1: request bodies describe their required fields, enums and integer-string amounts, and idempotent calls declare Idempotency-Key", async () => {
      const doc = await fetchDocument();

      const deposit = bodySchema(doc, "post", "/api/settlement/deposits");
      expect(deposit.type).toBe("object");
      expect([...(deposit.required ?? [])].sort()).toEqual(["accountId", "amount", "asset"]);
      expect(deposit.properties?.amount?.type).toBe("string");
      expect(String(deposit.properties?.amount?.pattern ?? "")).toMatch(/\[0-9\]|\\d/);
      const key = (doc.paths["/api/settlement/deposits"].post.parameters ?? []).find((p: Json) => p.name === "Idempotency-Key");
      expect(key).toMatchObject({ in: "header", required: true });

      const order = bodySchema(doc, "post", "/api/orders");
      expect([...(order.required ?? [])].sort()).toEqual(["accountId", "market", "quantity", "side"]);
      expect([...(order.properties?.side?.enum ?? [])].sort()).toEqual(["buy", "sell"]);
      expect([...(order.properties?.timeInForce?.enum ?? [])].sort()).toEqual(["FOK", "GTC", "IOC", "POST_ONLY"]);
      expect(order.properties?.price?.type).toBe("string");

      const account = bodySchema(doc, "post", "/api/ledger/accounts");
      expect([...(account.required ?? [])].sort()).toEqual(["name", "type"]);
      expect([...(account.properties?.type?.enum ?? [])].sort()).toEqual(["asset", "equity", "expense", "liability", "revenue"]);

      const login = bodySchema(doc, "post", "/api/auth/login");
      expect([...(login.required ?? [])].sort()).toEqual(["accountId", "role"]);
      expect([...(login.properties?.role?.enum ?? [])].sort()).toEqual(["admin", "operator"]);

      const limits = bodySchema(doc, "post", "/api/risk/limits");
      expect([...(limits.required ?? [])].sort()).toEqual(["accountId", "maxNotional", "maxOpenOrders", "maxPositionAbs"]);
      expect(limits.properties?.maxOpenOrders?.type).toBe("integer");
    });

    test("Challenge 19c-2: the documented response schemas match what the API really returns", async () => {
      const doc = await fetchDocument();
      const ajv = new Ajv({ strict: false, allErrors: true });
      addFormats(ajv);

      const cases: [string, string, string][] = [
        ["get", "/api/assets", "/api/assets"],
        ["get", "/api/orders/book/{market}/depth", "/api/orders/book/SCHEMA-CHECK/depth"],
      ];
      for (const [method, template, real] of cases) {
        const schema = doc.paths?.[template]?.[method]?.responses?.["200"]?.content?.["application/json"]?.schema;
        expect(schema, `${template} has no documented 200 schema`).toBeDefined();
        const validate = ajv.compile({ ...schema, components: doc.components });
        const response = await testSession.get(real);
        expect(response.status).toBe(HttpStatus.OK);
        expect(validate(response.body), `${template}: ${JSON.stringify(validate.errors)}`).toBe(true);
      }

      // The schema must be specific enough to fail a wrong shape: assets are objects with code, name and exponent.
      const assetsSchema = doc.paths["/api/assets"].get.responses["200"].content["application/json"].schema;
      const check = ajv.compile({ ...assetsSchema, components: doc.components });
      expect(check({ data: [{ code: "USD" }], meta: {} })).toBe(false);
      expect(check({ data: "nope", meta: {} })).toBe(false);
    });
  });

  describe("Challenge 19d: Swagger UI", () => {
    test("Challenge 19d-1: GET /api/docs serves an HTML page that loads Swagger UI against the document", async () => {
      const response = await testSession.get("/api/docs");
      expect(response.status).toBe(HttpStatus.OK);
      expect(response.headers["content-type"]).toMatch(/text\/html/);
      expect(response.text.toLowerCase()).toContain("swagger-ui");
      expect(response.text).toContain("/api/openapi.json");
    });

    test("Challenge 19d-2: the docs page relaxes the Content-Security-Policy just enough to run, while every other route stays locked down", async () => {
      const docs = await testSession.get("/api/docs");
      const csp = String(docs.headers["content-security-policy"] ?? "");
      expect(csp).toMatch(/script-src/);
      expect(csp).toMatch(/style-src/);

      const other = await testSession.get("/api/assets");
      expect(String(other.headers["content-security-policy"] ?? "")).toContain("default-src 'none'");
      expect(String(other.headers["content-security-policy"] ?? "")).not.toMatch(/script-src/);
    });
  });
});
