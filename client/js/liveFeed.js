// Live-update client for the operator dashboard. See tests/challenge17.test.ts.

function notImplemented(where) {
  throw new Error(`${where} is not implemented yet.`);
}

/**
 * @typedef {{ send(data: string): void, close(): void, onopen: (() => void) | null, onmessage: ((event: { data: string }) => void) | null, onclose: (() => void) | null }} FeedSocket
 */

/**
 * @typedef {Object} LiveFeedOptions
 * @property {string} url
 * @property {string[]} topics
 * @property {(url: string) => FeedSocket} createSocket
 * @property {(fn: () => void, ms: number) => number} setTimer
 * @property {(id: number) => void} clearTimer
 * @property {() => number} random
 * @property {(topic: string, message: { topic: string, seq: number, kind: "snapshot" | "delta", data: unknown }) => void} onMessage
 * @property {(status: "connecting" | "live" | "stale" | "reconnecting" | "stopped") => void} onStatus
 * @property {number} [staleAfterMs]
 * @property {number} [gapTimeoutMs]
 * @property {number} [baseDelayMs]
 * @property {number} [maxDelayMs]
 */

export class LiveFeedClient {
  /** @param {LiveFeedOptions} _options */
  constructor(_options) {
    notImplemented("LiveFeedClient");
  }

  start() {
    notImplemented("LiveFeedClient.start");
  }

  stop() {
    notImplemented("LiveFeedClient.stop");
  }
}

/**
 * Applies one order-book delta to a book without mutating it.
 * @param {{ bids: { price: string, quantity: string }[], asks: { price: string, quantity: string }[] }} _book
 * @param {{ side: string, price: string, quantity: string }} _delta
 * @returns {{ bids: { price: string, quantity: string }[], asks: { price: string, quantity: string }[] }}
 */
export function applyOrderBookDelta(_book, _delta) {
  notImplemented("applyOrderBookDelta");
}
