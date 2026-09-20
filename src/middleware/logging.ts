import type { Request, Response, NextFunction } from "express";

export interface LogRecord {
  timestamp: string;
  method: string;
  path: string;
  actor: string | null;
  status: number;
  durationMs: number;
}

// Wired globally into every request (see server.ts) — must never throw or
// every other challenge's tests break too. Implement real structured
// logging here (see Challenge 10) without changing that contract.
export default function structuredLogging(_req: Request, _res: Response, next: NextFunction): void {
  // TODO(Challenge 10): log one JSON LogRecord per request on response finish.
  next();
}
