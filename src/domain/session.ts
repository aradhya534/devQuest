import jwt from "jsonwebtoken";
import { v4 as uuidv4 } from "uuid";

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

function getJwtSecret(): string {
  return process.env.JWT_PRIVATE_KEY || "testDefaultJwtPrivateKeySecretKey123456";
}

export function issueTokens(principal: Principal): TokenPair {
  const secret = getJwtSecret();
  const accessToken = jwt.sign({ accountId: principal.accountId, role: principal.role }, secret, {
    expiresIn: "1h",
  });

  const familyId = uuidv4();
  const jti = uuidv4();
  families.set(familyId, {
    accountId: principal.accountId,
    role: principal.role,
    currentJti: jti,
    revoked: false,
  });

  const refreshToken = `${familyId}:${jti}`;
  return { accessToken, refreshToken };
}

export function verifyAccessToken(token: string): Principal {
  const secret = getJwtSecret();
  const payload = jwt.verify(token, secret) as jwt.JwtPayload;
  if (!payload || typeof payload.accountId !== "string" || (payload.role !== "operator" && payload.role !== "admin")) {
    throw new Error("Invalid access token payload");
  }
  return {
    accountId: payload.accountId,
    role: payload.role as Role,
  };
}

export interface RotateResult {
  tokens: TokenPair;
}

export class RefreshReuseError extends Error {
  constructor() {
    super("This refresh token has already been rotated — the whole token family is now invalid");
  }
}

export function rotateRefreshToken(refreshToken: string): RotateResult {
  const parts = refreshToken.split(":");
  if (parts.length !== 2) {
    throw new Error("Invalid refresh token format");
  }
  const [familyId, jti] = parts as [string, string];
  const family = families.get(familyId);
  if (!family) {
    throw new Error("Unknown token family");
  }

  if (family.revoked) {
    throw new RefreshReuseError();
  }

  if (family.currentJti !== jti) {
    family.revoked = true;
    throw new RefreshReuseError();
  }

  const newJti = uuidv4();
  family.currentJti = newJti;

  const secret = getJwtSecret();
  const accessToken = jwt.sign({ accountId: family.accountId, role: family.role }, secret, {
    expiresIn: "1h",
  });
  const newRefreshToken = `${familyId}:${newJti}`;

  return {
    tokens: {
      accessToken,
      refreshToken: newRefreshToken,
    },
  };
}

/** Test/debug-only escape hatch — resets all in-memory session state between test runs. */
export function resetAllSessions(): void {
  families.clear();
}
