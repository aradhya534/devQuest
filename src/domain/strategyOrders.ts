import { NotImplementedError } from "./notImplemented.js";

export type Side = "buy" | "sell";

/** An order the engine asks the matching layer to place. */
export interface ChildOrder {
  orderId: string;
  parentId: string;
  role: string;
  side: Side;
  kind: "limit" | "market";
  price?: bigint;
  quantity: bigint;
  sequence: number;
}

export type Action = { type: "place"; order: ChildOrder } | { type: "cancel"; orderId: string; parentId: string };

interface Base {
  id: string;
  accountId: string;
  sequence: number;
  quantity: bigint;
}

export interface OcoOrder extends Base {
  kind: "oco";
  side: Side;
  limitPrice: bigint;
  stopPrice: bigint;
}

export interface BracketOrder extends Base {
  kind: "bracket";
  side: Side;
  entryPrice: bigint;
  takeProfitPrice: bigint;
  stopLossPrice: bigint;
}

export interface IcebergOrder extends Base {
  kind: "iceberg";
  side: Side;
  price: bigint;
  clipQuantity: bigint;
}

export interface TrailingStopOrder extends Base {
  kind: "trailing_stop";
  side: Side;
  offset: bigint;
  referencePrice: bigint;
}

export type StrategyOrder = OcoOrder | BracketOrder | IcebergOrder | TrailingStopOrder;

export interface Fill {
  orderId: string;
  fillId: string;
  quantity: bigint;
}

/** Turns compound orders (OCO, bracket, iceberg, trailing stop) into simple child orders. See tests/challenge15.test.ts. */
export class StrategyEngine {
  submit(_order: StrategyOrder): Action[] {
    throw new NotImplementedError("StrategyEngine.submit");
  }

  onFill(_fill: Fill): Action[] {
    throw new NotImplementedError("StrategyEngine.onFill");
  }

  onMarketPrice(_price: bigint): Action[] {
    throw new NotImplementedError("StrategyEngine.onMarketPrice");
  }

  cancel(_parentId: string): Action[] {
    throw new NotImplementedError("StrategyEngine.cancel");
  }

  stopLevel(_parentId: string): bigint | undefined {
    throw new NotImplementedError("StrategyEngine.stopLevel");
  }
}
