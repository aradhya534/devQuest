import type { Request, Response } from "express";
import { NotImplementedError } from "../domain/notImplemented.js";

// API documentation. See tests/challenge19.test.ts.
const openapi = async (_req: Request, _res: Response): Promise<void> => {
  throw new NotImplementedError("openapi");
};

const ui = async (_req: Request, _res: Response): Promise<void> => {
  throw new NotImplementedError("swaggerUi");
};

export default { openapi, ui };
