import type { Request, Response } from "express";
import { NotImplementedError } from "../domain/notImplemented.js";

// A deliberately trivial, self-contained resource for Challenge 11's
// caching requirement — no other challenge reads or writes it.

const store = new Map<string, string>();

const getConfig = async (_req: Request<{ key: string }>, _res: Response): Promise<void> => {
  throw new NotImplementedError("getConfig");
};

interface PutConfigBody {
  value?: unknown;
}

const putConfig = async (_req: Request<{ key: string }, unknown, PutConfigBody>, _res: Response): Promise<void> => {
  throw new NotImplementedError("putConfig");
};

export default { getConfig, putConfig, store };
