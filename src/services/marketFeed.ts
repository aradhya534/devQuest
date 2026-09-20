import { NotImplementedError } from "../domain/notImplemented.js";
import * as liveHub from "./liveHub.js";

export interface Level {
  price: string;
  quantity: string;
}

export interface Depth {
  bids: Level[];
  asks: Level[];
}

export interface BookDelta {
  side: "bids" | "asks";
  price: string;
  quantity: string;
}

/** The book levels that differ between two snapshots, as deltas. See tests/challenge18.test.ts. */
export function diffDepth(_before: Depth, _after: Depth): BookDelta[] {
  throw new NotImplementedError("diffDepth");
}

/** Publishes what changed between two snapshots of a market's book. The feed must never break order flow. */
export function publishBookChange(market: string, before: Depth, after: Depth): void {
  try {
    for (const delta of diffDepth(before, after)) liveHub.publish(`orderbook:${market}`, delta);
  } catch {
    /* the live feed is optional */
  }
}
