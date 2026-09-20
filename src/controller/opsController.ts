import type { Request, Response } from "express";
import { NotImplementedError } from "../domain/notImplemented.js";

const health = async (_req: Request, _res: Response): Promise<void> => {
  throw new NotImplementedError("health");
};

const ready = async (_req: Request, _res: Response): Promise<void> => {
  throw new NotImplementedError("ready");
};

const getMetrics = async (_req: Request, _res: Response): Promise<void> => {
  throw new NotImplementedError("getMetrics");
};

export default { health, ready, getMetrics };
