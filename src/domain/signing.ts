import { NotImplementedError } from "./notImplemented.js";

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

export function sign(_input: SignInput): string {
  throw new NotImplementedError("sign");
}

export function verifySignature(_input: VerifyInput): VerifyResult {
  throw new NotImplementedError("verifySignature");
}

export function isWithinWindow(_timestamp: unknown, _now: number = Date.now(), _windowMs: number = SIGNATURE_WINDOW_MS): boolean {
  throw new NotImplementedError("isWithinWindow");
}
