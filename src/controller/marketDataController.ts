import type { Request, Response } from "express";
import HttpStatus from "../enums/httpStatus.js";
import { aggregateCandles, fillGaps, vwap, type Trade } from "../domain/marketData.js";

interface RawTrade {
  sequence?: unknown;
  price?: unknown;
  quantity?: unknown;
  timestampMs?: unknown;
}

interface CandlesBody {
  trades?: RawTrade[];
  resolutionMs?: unknown;
  fillEmptyBuckets?: unknown;
}

function parseTrades(raw: RawTrade[] | undefined): Trade[] | null {
  if (!Array.isArray(raw)) return null;
  const trades: Trade[] = [];
  for (const item of raw) {
    if (typeof item.sequence !== "number" || typeof item.price !== "string" || typeof item.quantity !== "string" || typeof item.timestampMs !== "number") {
      return null;
    }
    trades.push({ sequence: item.sequence, price: BigInt(item.price), quantity: BigInt(item.quantity), timestampMs: item.timestampMs });
  }
  return trades;
}

const candles = async (req: Request<unknown, unknown, CandlesBody>, res: Response): Promise<void> => {
  const trades = parseTrades(req.body.trades);
  const { resolutionMs, fillEmptyBuckets } = req.body;

  if (!trades || typeof resolutionMs !== "number" || resolutionMs <= 0) {
    res.status(HttpStatus.BAD_REQUEST).json({ error: { code: "INVALID_REQUEST", details: [] } });
    return;
  }

  const aggregated = aggregateCandles(trades, resolutionMs);
  const result = fillEmptyBuckets === true ? fillGaps(aggregated, resolutionMs) : aggregated;

  res.status(HttpStatus.OK).json({
    data: result.map((c) => ({ ...c, open: c.open.toString(), high: c.high.toString(), low: c.low.toString(), close: c.close.toString(), volume: c.volume.toString() })),
    meta: {},
  });
};

const vwapEndpoint = async (req: Request<unknown, unknown, CandlesBody>, res: Response): Promise<void> => {
  const trades = parseTrades(req.body.trades);
  if (!trades) {
    res.status(HttpStatus.BAD_REQUEST).json({ error: { code: "INVALID_REQUEST", details: [] } });
    return;
  }
  const result = vwap(trades);
  res.status(HttpStatus.OK).json({ data: { price: result.price.toString(), remainder: result.remainder.toString() }, meta: {} });
};

export default { candles, vwap: vwapEndpoint };
