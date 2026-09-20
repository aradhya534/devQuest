import type { NextFunction, Request, RequestHandler, Response } from "express";

export default function asyncHandler<P = Record<string, string>, ResBody = unknown, ReqBody = unknown>(
  handler: (req: Request<P, ResBody, ReqBody>, res: Response, next: NextFunction) => Promise<void>,
): RequestHandler<P, ResBody, ReqBody> {
  return (req, res, next) => {
    handler(req, res, next);
  };
}
