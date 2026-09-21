import type { Request, Response, NextFunction } from "express";
import HttpStatus from "../enums/httpStatus.js";
import { verifySignature, isWithinWindow, SIGNATURE_WINDOW_MS } from "../domain/signing.js";

const seenNonces = new Map<string, number>(); // nonce -> expiryEpochMs

function sweepExpired(now: number): void {
  for (const [nonce, expiry] of seenNonces) {
    if (expiry <= now) seenNonces.delete(nonce);
  }
}

function getSecret(): string {
  const secret = process.env.NODE_ENV === "test" ? process.env.HMAC_SECRET || "testOnlyDefaultHmacSecret" : process.env.HMAC_SECRET;
  if (!secret) {
    throw new Error("HMAC_SECRET is not configured");
  }
  return secret;
}

function reject(res: Response, status: number, code: string, message: string): void {
  res.status(status).json({ error: { code, details: [{ message }] } });
}

export default function hmacAuth(req: Request, res: Response, next: NextFunction): void {
  const signature = req.header("X-Signature");
  const timestamp = req.header("X-Timestamp");
  const nonce = req.header("X-Nonce");
  const algorithm = req.header("X-Algorithm");

  if (!signature || !timestamp || !nonce || !algorithm) {
    reject(res, HttpStatus.UNAUTHORIZED, "SIGNATURE_REQUIRED", "Missing signature headers");
    return;
  }

  const now = Date.now();
  sweepExpired(now);

  if (!isWithinWindow(timestamp, now)) {
    reject(res, HttpStatus.UNAUTHORIZED, "SIGNATURE_EXPIRED", "Timestamp outside the allowed signing window");
    return;
  }

  if (seenNonces.has(nonce)) {
    reject(res, HttpStatus.UNAUTHORIZED, "NONCE_REPLAYED", "This nonce has already been used");
    return;
  }

  const rawBody = req.rawBody ?? "";

  let secret: string;
  try {
    secret = getSecret();
  } catch {
    res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({ error: { code: "SERVER_MISCONFIGURED", details: [] } });
    return;
  }

  const result = verifySignature({
    method: req.method,
    path: req.originalUrl,
    rawBody,
    timestamp,
    nonce,
    algorithm,
    signature,
    secret,
  });

  if (!result.valid) {
    reject(res, HttpStatus.UNAUTHORIZED, result.reason, "Invalid request signature");
    return;
  }

  seenNonces.set(nonce, now + SIGNATURE_WINDOW_MS);

  next();
}
