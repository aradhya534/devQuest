import type { Request, Response } from "express";
import db from "../../db/db-config.js";
import HttpStatus from "../enums/httpStatus.js";
import { verifyChain, balancesToJson } from "../domain/events.js";
import * as eventRepository from "../repositories/eventRepository.js";

const INTEGER = /^[0-9]+$/;

interface DepositEventBody {
  accountId?: unknown;
  asset?: unknown;
  amount?: unknown;
}

const recordDeposit = async (req: Request<unknown, unknown, DepositEventBody>, res: Response): Promise<void> => {
  const { accountId, asset, amount } = req.body;
  if (typeof accountId !== "string" || typeof asset !== "string" || typeof amount !== "string" || !INTEGER.test(amount)) {
    res.status(HttpStatus.BAD_REQUEST).json({ error: { code: "INVALID_EVENT", details: [] } });
    return;
  }

  const event = await eventRepository.append(db, "deposited", accountId, asset, amount);
  res.status(HttpStatus.CREATED).json({ data: { seq: event.seq, hash: event.hash }, meta: {} });
};

const rebuild = async (_req: Request, res: Response): Promise<void> => {
  const balances = await eventRepository.rebuildFullState(db);
  res.status(HttpStatus.OK).json({ data: balancesToJson(balances), meta: {} });
};

interface SnapshotBody {
  upToSeq?: unknown;
}

const createSnapshot = async (req: Request<unknown, unknown, SnapshotBody>, res: Response): Promise<void> => {
  const { upToSeq } = req.body;
  if (typeof upToSeq !== "number") {
    res.status(HttpStatus.BAD_REQUEST).json({ error: { code: "INVALID_REQUEST", details: [] } });
    return;
  }
  await eventRepository.takeSnapshot(db, upToSeq);
  res.status(HttpStatus.CREATED).json({ data: { upToSeq }, meta: {} });
};

const stateAt = async (req: Request, res: Response): Promise<void> => {
  const { atSequence } = req.query;
  if (typeof atSequence !== "string" || !INTEGER.test(atSequence)) {
    res.status(HttpStatus.BAD_REQUEST).json({ error: { code: "INVALID_REQUEST", details: [] } });
    return;
  }
  const balances = await eventRepository.stateAtSequence(db, Number(atSequence));
  res.status(HttpStatus.OK).json({ data: balancesToJson(balances), meta: {} });
};

const verify = async (_req: Request, res: Response): Promise<void> => {
  const events = await eventRepository.listAll(db);
  const result = verifyChain(events);
  res.status(HttpStatus.OK).json({ data: result, meta: {} });
};

export default { recordDeposit, rebuild, createSnapshot, stateAt, verify };
