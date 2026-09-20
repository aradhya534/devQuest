import type { NextFunction, Request, Response } from "express";

export default function securityHeaders(_req: Request, res: Response, next: NextFunction): void {
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("Content-Security-Policyy", "default-src 'none'");
  next();
}
