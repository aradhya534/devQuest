import type { Request, Response } from "express";
import HttpStatus from "../enums/httpStatus.js";
import * as risk from "../services/riskRegistry.js";

interface SetLimitsBody {
  accountId?: unknown;
  maxNotional?: unknown;
  maxOpenOrders?: unknown;
  maxPositionAbs?: unknown;
}

const INTEGER = /^[0-9]+$/;

const setLimits = async (req: Request<unknown, unknown, SetLimitsBody>, res: Response): Promise<void> => {
  const { accountId, maxNotional, maxOpenOrders, maxPositionAbs } = req.body;

  if (typeof accountId !== "string" || typeof maxNotional !== "string" || !INTEGER.test(maxNotional) || typeof maxOpenOrders !== "number" || typeof maxPositionAbs !== "string" || !INTEGER.test(maxPositionAbs)) {
    res.status(HttpStatus.BAD_REQUEST).json({ error: "INVALID_LIMITS" });
    return;
  }

  risk.setLimits(accountId, { maxNotional: BigInt(maxNotional), maxOpenOrders, maxPositionAbs: BigInt(maxPositionAbs) });
  res.status(HttpStatus.OK).json({ data: { accountId, maxNotional, maxOpenOrders, maxPositionAbs }, meta: {} });
};

const getState = async (req: Request<{ accountId: string }>, res: Response): Promise<void> => {
  const state = risk.getState(req.params.accountId);
  const limits = risk.getLimits(req.params.accountId);
  res.status(HttpStatus.OK).json({
    data: {
      openOrderCount: state.openOrderCount,
      committedExposure: state.committedExposure.toString(),
      limits: { maxNotional: limits.maxNotional.toString(), maxOpenOrders: limits.maxOpenOrders, maxPositionAbs: limits.maxPositionAbs.toString() },
    },
    meta: {},
  });
};

interface KillSwitchBody {
  engaged?: unknown;
}

const setKillSwitch = async (req: Request<unknown, unknown, KillSwitchBody>, res: Response): Promise<void> => {
  if (typeof req.body.engaged !== "boolean") {
    res.status(HttpStatus.BAD_REQUEST).json({ error: { code: "INVALID_REQUEST", details: [] } });
    return;
  }
  risk.setKillSwitch(req.body.engaged);
  res.status(HttpStatus.OK).json({ data: { engaged: req.body.engaged }, meta: {} });
};

export default { setLimits, getState, setKillSwitch };
