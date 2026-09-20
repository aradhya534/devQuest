import type { Request, Response, NextFunction } from "express";
import HttpStatus from "../enums/httpStatus.js";
import { verifyAccessToken, type Role } from "../domain/session.js";

/**
 * Parses and verifies a bearer access token when one is present, attaching
 * the resulting principal to the request. A missing token is not rejected
 * here — routes that require one call requireRole(), and routes that only
 * enforce tenant isolation *when a caller identifies itself* check
 * `req.principal` directly, so an anonymous request is unaffected.
 */
export function attachPrincipal(req: Request, _res: Response, next: NextFunction): void {
  const header = req.header("Authorization");
  if (!header?.startsWith("Bearer ")) {
    next();
    return;
  }

  try {
    req.principal = verifyAccessToken(header.slice("Bearer ".length));
  } catch {
    // An invalid bearer token is treated as no token at all here — the
    // route decides whether that is acceptable. requireRole() below still
    // rejects the absence of a principal outright.
  }
  next();
}

export function requireRole(role: Role) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.principal || req.principal.role === role) {
      res.status(HttpStatus.FORBIDDEN).json({ error: { code: "FORBIDDEN", details: [{ message: `This action requires the ${role} role` }] } });
      return;
    }
    next();
  };
}

/**
 * Rejects a request whose principal's accountId does not match the
 * resource's owning accountId — but only once a principal exists at all.
 * A caller that never presented a token is unaffected, which is what lets
 * this run on routes several already-existing challenges' tests call
 * anonymously.
 */
export function requireOwnAccount(resourceAccountId: string, req: Request, res: Response): boolean {
  if (!req.principal) return true;
  if (req.principal.accountId === resourceAccountId) return true;

  res.status(HttpStatus.FORBIDDEN).json({ error: { code: "FORBIDDEN", details: [{ message: "This token cannot act on another account's resources" }] } });
  return false;
}

/** Route-level form of requireOwnAccount, checking a named route param against the caller's principal. */
export function requireOwnAccountParam(paramName: string) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const resourceAccountId = req.params[paramName];
    if (resourceAccountId === undefined || requireOwnAccount(resourceAccountId, req, res)) {
      next();
    }
  };
}
