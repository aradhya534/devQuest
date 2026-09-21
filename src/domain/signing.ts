import crypto from "node:crypto";

export const ALLOWED_ALGORITHMS = ["HMAC-SHA256"] as const;
export type SigningAlgorithm = (typeof ALLOWED_ALGORITHMS)[number];

export const SIGNATURE_WINDOW_MS = 30_000;

export interface SignInput {
  method: string;
  path: string;
  rawBody: string | undefined;
  timestamp: number | string;
  nonce: string;
  secret: string;
}

export interface VerifyInput extends SignInput {
  algorithm: string;
  signature: string;
}

export type VerifyResult = { valid: true } | { valid: false; reason: string };

export function sign(input: SignInput): string {
  const bodyDigest = crypto.createHash("sha256").update(input.rawBody ?? "", "utf8").digest("hex");
  const message = [input.method.toUpperCase(), input.path, bodyDigest, String(input.timestamp), input.nonce].join("\n");
  return crypto.createHmac("sha256", input.secret).update(message, "utf8").digest("hex");
}

export function verifySignature(input: VerifyInput): VerifyResult {
  if (!ALLOWED_ALGORITHMS.includes(input.algorithm as SigningAlgorithm)) {
    return { valid: false, reason: "UNSUPPORTED_ALGORITHM" };
  }

  const expectedSignature = sign(input);

  const sigBuf = Buffer.from(input.signature, "utf8");
  const expBuf = Buffer.from(expectedSignature, "utf8");

  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    return { valid: false, reason: "INVALID_SIGNATURE" };
  }

  return { valid: true };
}

export function isWithinWindow(timestamp: unknown, now: number = Date.now(), windowMs: number = SIGNATURE_WINDOW_MS): boolean {
  if (typeof timestamp !== "number" && typeof timestamp !== "string") {
    return false;
  }
  const ts = Number(timestamp);
  if (Number.isNaN(ts)) {
    return false;
  }
  return Math.abs(now - ts) <= windowMs;
}
