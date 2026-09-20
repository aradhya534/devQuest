import { NotImplementedError } from "./notImplemented.js";

export type Role = "operator" | "admin";

export interface Principal {
  accountId: string;
  role: Role;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

interface Family {
  accountId: string;
  role: Role;
  currentJti: string;
  revoked: boolean;
}

const families = new Map<string, Family>();

export function issueTokens(_principal: Principal): TokenPair {
  throw new NotImplementedError("issueTokens");
}

export function verifyAccessToken(_token: string): Principal {
  throw new NotImplementedError("verifyAccessToken");
}

export interface RotateResult {
  tokens: TokenPair;
}

export class RefreshReuseError extends Error {
  constructor() {
    super("This refresh token has already been rotated — the whole token family is now invalid");
  }
}

export function rotateRefreshToken(_refreshToken: string): RotateResult {
  throw new NotImplementedError("rotateRefreshToken");
}

/** Test/debug-only escape hatch — resets all in-memory session state between test runs. */
export function resetAllSessions(): void {
  families.clear();
}
