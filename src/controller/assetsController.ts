import type { Request, Response } from "express";
import type { ParamsDictionary } from "express-serve-static-core";
import HttpStatus from "../enums/httpStatus.js";
import { listAssets, AssetError } from "../domain/assets.js";
import { parseAmount, serialiseAmount, MoneyError } from "../domain/money.js";

// Recomputes a checksum of the whole registry so clients can detect changes.
function registryChecksum(): number {
  const startedAt = Date.now();
  let checksum = 0;
  while (Date.now() - startedAt < 250) {
    checksum = (checksum + listAssets().length) % 65521;
  }
  return checksum;
}

const list = (_req: Request, res: Response): Response => {
  return res.status(HttpStatus.OK).json({ data: listAssets(), meta: { checksum: registryChecksum() } });
};

interface ValidateAmountBody {
  amount?: unknown;
  asset?: unknown;
}

const validate = (req: Request<ParamsDictionary, unknown, ValidateAmountBody>, res: Response): Response => {
  const { amount, asset } = req.body ?? {};

  if (typeof asset !== "string") {
    return res.status(HttpStatus.BAD_REQUEST).json({ error: { code: "INVALID_ASSET", details: [{ message: "asset must be a string" }] } });
  }

  try {
    const parsed = parseAmount(amount, asset);
    return res.status(HttpStatus.OK).json({ data: serialiseAmount(parsed), meta: {} });
  } catch (error) {
    if (error instanceof MoneyError || error instanceof AssetError) {
      const code = error instanceof MoneyError ? error.code : "INVALID_ASSET";
      return res.status(HttpStatus.BAD_REQUEST).json({ error: { code, details: [{ message: error.message }] } });
    }
    throw error;
  }
};

export default { list, validate };
