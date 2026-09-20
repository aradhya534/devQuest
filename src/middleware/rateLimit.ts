import type { Request, Response, NextFunction } from "express";

export interface RateLimitOptions {
  limit: number;
  windowMs: number;
  keyFor: (req: Request) => string;
}

// Wired into the auth/orders routes (see server.ts) — must never throw or
// every other challenge's tests that log in or place orders break too.
// Implement real fixed-window rate limiting here (see Challenge 10)
// without changing that contract.
export default function rateLimit(_options: RateLimitOptions) {
  return (_req: Request, _res: Response, next: NextFunction): void => {
    // TODO(Challenge 10): enforce the window/limit and return 429 + Retry-After when exceeded.
    next();
  };
}
