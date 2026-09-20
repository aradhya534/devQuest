import type { Request, Response } from "express";
import { v4 as uuidv4 } from "uuid";
import HttpStatus from "../enums/httpStatus.js";
import * as engine from "../services/matchingEngine.js";
import * as risk from "../services/riskRegistry.js";
import { publishBookChange } from "../services/marketFeed.js";
import { firstViolatedRule, reserve, release as releaseRisk } from "../domain/risk.js";
import type { Side, TimeInForce } from "../domain/orderBook.js";
import db from "../../db/db-config.js";
import { getStatus } from "../repositories/accountsRepository.js";

interface CreateOrderBody {
  accountId?: unknown;
  market?: unknown;
  side?: unknown;
  price?: unknown;
  quantity?: unknown;
  timeInForce?: unknown;
  orderType?: unknown;
  stopPrice?: unknown;
}

const SIDES: ReadonlySet<string> = new Set(["buy", "sell"]);
const TIMES_IN_FORCE: ReadonlySet<string> = new Set(["GTC", "IOC", "FOK", "POST_ONLY"]);
const ORDER_TYPES: ReadonlySet<string> = new Set(["limit", "market", "stop", "stop_limit"]);
const INTEGER = /^[0-9]+$/;

const create = async (req: Request<unknown, unknown, CreateOrderBody>, res: Response): Promise<void> => {
  const { accountId, market, side, price, quantity, timeInForce = "GTC", orderType: rawOrderType, stopPrice } = req.body;

  if (typeof accountId !== "string" || typeof market !== "string" || typeof side !== "string" || !SIDES.has(side) || typeof quantity !== "string" || !INTEGER.test(quantity) || typeof timeInForce !== "string" || !TIMES_IN_FORCE.has(timeInForce)) {
    res.status(HttpStatus.BAD_REQUEST).json({ error: { code: "INVALID_ORDER", details: [{ message: "accountId, market, side, quantity (integer string) and a valid timeInForce are required" }] } });
    return;
  }

  if (rawOrderType !== undefined && (typeof rawOrderType !== "string" || !ORDER_TYPES.has(rawOrderType))) {
    res.status(HttpStatus.BAD_REQUEST).json({ error: { code: "INVALID_ORDER_TYPE", details: [{ message: "orderType must be one of limit, market, stop, stop_limit when supplied" }] } });
    return;
  }

  // Defaults to "limit" when a price is present and no explicit type is given (preserving every
  // existing test's behavior, none of which send orderType), or "market" when no price is given.
  const orderType = (rawOrderType as "limit" | "market" | "stop" | "stop_limit" | undefined) ?? (price !== undefined ? "limit" : "market");

  if (price !== undefined && (typeof price !== "string" || !INTEGER.test(price))) {
    res.status(HttpStatus.BAD_REQUEST).json({ error: { code: "INVALID_PRICE", details: [{ message: "price must be an integer string when supplied" }] } });
    return;
  }

  if ((orderType === "stop" || orderType === "stop_limit") && (typeof stopPrice !== "string" || !INTEGER.test(stopPrice))) {
    res.status(HttpStatus.BAD_REQUEST).json({ error: { code: "INVALID_STOP_PRICE", details: [{ message: "stopPrice must be an integer string for stop and stop_limit orders" }] } });
    return;
  }

  // A plain stop order legitimately has no price, only a stopPrice — skip the price-required
  // rejection for it. A stop_limit order DOES require both price (its limit) and stopPrice, so it
  // gets no exception here.
  if (price === undefined && timeInForce !== "IOC" && timeInForce !== "FOK" && orderType !== "stop") {
    res.status(HttpStatus.BAD_REQUEST).json({ error: { code: "PRICE_REQUIRED", details: [{ message: "a resting order requires a limit price" }] } });
    return;
  }

  if (risk.isKillSwitchEngaged()) {
    res.status(HttpStatus.CONFLICT).json({ error: { code: "KILL_SWITCH_ENGAGED", details: [] } });
    return;
  }

  const accountStatus = await getStatus(db, accountId);
  if (accountStatus === "closed") {
    res.status(HttpStatus.CONFLICT).json({ error: { code: "ACCOUNT_CLOSED", details: [] } });
    return;
  }

  const orderSide = side as Side;
  const orderQuantity = BigInt(quantity);
  const orderPrice = price !== undefined ? BigInt(price as string) : undefined;
  const orderStopPrice = stopPrice !== undefined ? BigInt(stopPrice as string) : undefined;
  const willRest = orderPrice !== undefined && timeInForce !== "IOC" && timeInForce !== "FOK";

  const state = risk.getState(accountId);
  const limits = risk.getLimits(accountId);
  const violation = firstViolatedRule(state, limits, { side: orderSide, price: orderPrice, quantity: orderQuantity, willRest });

  if (violation) {
    res.status(HttpStatus.CONFLICT).json({ error: { code: violation, details: [] } });
    return;
  }

  const orderId = uuidv4();
  if (willRest) {
    risk.setState(accountId, reserve(state, { side: orderSide, price: orderPrice, quantity: orderQuantity, willRest }));
    risk.registerReservation(orderId, { accountId, side: orderSide, quantity: orderQuantity });
  }

  engine.rememberOrder(orderId, accountId);
  const bookBefore = engine.depth(market);
  const result = engine.placeOrder(market, {
    id: orderId,
    accountId,
    side: orderSide,
    price: orderPrice,
    quantity: orderQuantity,
    timeInForce: timeInForce as TimeInForce,
    orderType,
    stopPrice: orderStopPrice,
  });

  engine.recordTrades(market, result.trades, orderSide);
  publishBookChange(market, bookBefore, engine.depth(market));

  if (result.rejected) {
    if (willRest) {
      const reservation = risk.takeReservation(orderId);
      if (reservation) {
        risk.setState(accountId, releaseRisk(risk.getState(accountId), reservation.side, reservation.quantity));
      }
    }
    res.status(HttpStatus.CONFLICT).json({ error: { code: result.rejectionReason, details: [] } });
    return;
  }

  res.status(HttpStatus.CREATED).json({
    data: {
      orderId: result.restingOrder?.id ?? null,
      resting: result.restingOrder !== null,
      trades: result.trades.map((trade) => ({ ...trade, price: trade.price.toString(), quantity: trade.quantity.toString() })),
      cancellations: result.cancellations,
    },
    meta: {},
  });
};

const remove = async (req: Request<{ orderId: string }>, res: Response): Promise<void> => {
  const market = engine.marketOf(req.params.orderId);
  const bookBefore = market !== undefined ? engine.depth(market) : undefined;
  const outcome = engine.cancel(req.params.orderId);
  if (market !== undefined && bookBefore !== undefined) publishBookChange(market, bookBefore, engine.depth(market));
  if (!outcome.found) {
    res.status(HttpStatus.NOT_FOUND).json({ error: { code: "ORDER_NOT_FOUND", details: [] } });
    return;
  }

  if (outcome.cancelled) {
    const reservation = risk.takeReservation(req.params.orderId);
    if (reservation) {
      risk.setState(reservation.accountId, releaseRisk(risk.getState(reservation.accountId), reservation.side, reservation.quantity));
    }
  }

  res.status(HttpStatus.OK).json({ data: { orderId: req.params.orderId, cancelled: outcome.cancelled }, meta: {} });
};

const bookSnapshot = async (req: Request<{ market: string }>, res: Response): Promise<void> => {
  res.status(HttpStatus.OK).json({ data: engine.bestPrices(req.params.market), meta: {} });
};

const recentTradesList = async (req: Request, res: Response): Promise<void> => {
  const requested = Number(req.query.limit ?? 10);
  const limit = Number.isInteger(requested) && requested > 0 ? Math.min(requested, 50) : 10;
  res.status(HttpStatus.OK).json({ data: engine.recentTrades(limit), meta: {} });
};

const bookDepth = async (req: Request<{ market: string }>, res: Response): Promise<void> => {
  res.status(HttpStatus.OK).json({ data: engine.depth(req.params.market), meta: {} });
};

interface AmendOrderBody {
  price?: unknown;
  quantity?: unknown;
}

const amend = async (req: Request<{ orderId: string }, unknown, AmendOrderBody>, res: Response): Promise<void> => {
  const { price, quantity } = req.body;

  if (price === undefined && quantity === undefined) {
    res.status(HttpStatus.BAD_REQUEST).json({ error: { code: "INVALID_AMEND", details: [{ message: "at least one of price or quantity is required" }] } });
    return;
  }
  if (price !== undefined && (typeof price !== "string" || !INTEGER.test(price))) {
    res.status(HttpStatus.BAD_REQUEST).json({ error: { code: "INVALID_PRICE", details: [] } });
    return;
  }
  if (quantity !== undefined && (typeof quantity !== "string" || !INTEGER.test(quantity))) {
    res.status(HttpStatus.BAD_REQUEST).json({ error: { code: "INVALID_QUANTITY", details: [] } });
    return;
  }
  if (quantity !== undefined && BigInt(quantity) <= 0n) {
    res.status(HttpStatus.CONFLICT).json({ error: { code: "AMEND_TO_NONPOSITIVE_QUANTITY", details: [] } });
    return;
  }

  const amendMarket = engine.marketOf(req.params.orderId);
  const amendBefore = amendMarket !== undefined ? engine.depth(amendMarket) : undefined;
  const result = engine.amend(req.params.orderId, price !== undefined ? BigInt(price) : undefined, quantity !== undefined ? BigInt(quantity) : undefined);
  if (amendMarket !== undefined && amendBefore !== undefined) publishBookChange(amendMarket, amendBefore, engine.depth(amendMarket));
  if (!result.found || !result.amended) {
    res.status(HttpStatus.NOT_FOUND).json({ error: { code: "ORDER_NOT_FOUND", details: [] } });
    return;
  }

  res.status(HttpStatus.OK).json({
    data: { orderId: result.amended.id, price: result.amended.price.toString(), quantity: result.amended.quantity.toString() },
    meta: {},
  });
};

export default { create, remove, bookSnapshot, bookDepth, recentTrades: recentTradesList, amend };
