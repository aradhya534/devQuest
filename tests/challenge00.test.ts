import { describe, test, expect, vi } from "vitest";
import type { Request, Response, NextFunction } from "express";
import crypto from "node:crypto";

vi.mock("../src/domain/signing.js", () => ({
  verifySignature: () => ({ valid: true }),
  isWithinWindow: () => true,
  SIGNATURE_WINDOW_MS: 30000,
}));

import { requireRole } from "../src/middleware/rbac.js";
import hmacAuth from "../src/middleware/hmacAuth.js";
import asyncHandler from "../src/middleware/asyncHandler.js";
import HttpStatus from "../src/enums/httpStatus.js";
import securityHeaders from "../src/middleware/securityHeaders.js";
import * as cache from "../src/services/cache.js";

function fakeRes() {
  let statusCode: number | undefined;
  let jsonBody: unknown;
  const headers: Record<string, string> = {};
  const res = {
    status(code: number) {
      statusCode = code;
      return res;
    },
    json(body: unknown) {
      jsonBody = body;
      return res;
    },
    setHeader(name: string, value: string) {
      headers[name] = value;
    },
  } as unknown as Response;
  return { res, getStatus: () => statusCode, getBody: () => jsonBody, getHeaders: () => headers };
}

describe("Challenge 00: Infrastructure Bug Hunt", () => {
  describe("Challenge 0a: Authorization", () => {
    test("Challenge 0a-1: an operator principal is rejected by an admin-only route guard, and an admin principal is accepted", () => {
      const guard = requireRole("admin");

      const operatorAttempt = fakeRes();
      let operatorNextCalled = false;
      guard({ principal: { accountId: "op-1", role: "operator" } } as Request, operatorAttempt.res, () => {
        operatorNextCalled = true;
      });
      expect(operatorNextCalled).toBe(false);
      expect(operatorAttempt.getBody()).toMatchObject({ error: { code: "FORBIDDEN" } });

      const adminAttempt = fakeRes();
      let adminNextCalled = false;
      guard({ principal: { accountId: "admin-1", role: "admin" } } as Request, adminAttempt.res, () => {
        adminNextCalled = true;
      });
      expect(adminNextCalled).toBe(true);
    });
  });

  describe("Challenge 0b: Replay protection", () => {
    test("Challenge 0b-1: a replayed nonce is rejected on the second use of the same signed request", () => {
      const headerValues: Record<string, string> = {
        "X-Signature": "sig",
        "X-Timestamp": String(Date.now()),
        "X-Nonce": `nonce-${crypto.randomUUID()}`,
        "X-Algorithm": "HMAC-SHA256",
      };
      const makeReq = () =>
        ({
          header: (name: string) => headerValues[name],
          rawBody: "{}",
        }) as unknown as Request;

      const first = fakeRes();
      let firstNextCalled = false;
      hmacAuth(makeReq(), first.res, (() => {
        firstNextCalled = true;
      }) as NextFunction);
      expect(firstNextCalled).toBe(true);

      const second = fakeRes();
      let secondNextCalled = false;
      hmacAuth(makeReq(), second.res, (() => {
        secondNextCalled = true;
      }) as NextFunction);
      expect(secondNextCalled).toBe(false);
      expect(second.getBody()).toMatchObject({ error: { code: "NONCE_REPLAYED" } });
    });
  });

  describe("Challenge 0c: Async error handling", () => {
    test("Challenge 0c-1: a rejected promise from the wrapped handler reaches next(), not an unhandled rejection", async () => {
      const boom = new Error("boom");
      const handler = asyncHandler(async () => {
        throw boom;
      });

      let unhandled: unknown;
      const onUnhandled = (reason: unknown) => {
        unhandled = reason;
      };
      process.once("unhandledRejection", onUnhandled);

      const receivedError = await new Promise((resolve) => {
        const next = ((err?: unknown) => resolve(err)) as NextFunction;
        handler({} as Request, {} as Response, next);
        setTimeout(() => resolve(undefined), 100);
      });

      process.removeListener("unhandledRejection", onUnhandled);

      expect(receivedError).toBe(boom);
      expect(unhandled).toBeUndefined();
    });
  });

  describe("Challenge 0d: HTTP status codes", () => {
    test("Challenge 0d-1: UNAUTHORIZED is 401 and FORBIDDEN is 403, the literal values every HTTP client expects", () => {
      expect(HttpStatus.UNAUTHORIZED).toBe(401);
      expect(HttpStatus.FORBIDDEN).toBe(403);
    });
  });

  describe("Challenge 0e: Security headers", () => {
    test("Challenge 0e-1: the Content-Security-Policy header is actually sent under its correct name", () => {
      const { res, getHeaders } = fakeRes();
      securityHeaders({} as Request, res, () => {});
      expect(getHeaders()["Content-Security-Policy"]).toBe("default-src 'none'");
    });
  });

  describe("Challenge 0f: Response cache", () => {
    test("Challenge 0f-1: invalidate actually removes the cached entry", () => {
      const key = `key-${crypto.randomUUID()}`;
      cache.set(key, "value", 60_000);
      expect(cache.get(key)).toBe("value");
      cache.invalidate(key);
      expect(cache.get(key)).toBeUndefined();
    });
  });
});
