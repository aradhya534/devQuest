import fc from "fast-check";
import { JSDOM } from "jsdom";
import { expect, test, describe } from "vitest";
import { LiveFeedClient, applyOrderBookDelta } from "../client/js/liveFeed.js";
import { renderBalance, renderOrderBook, renderRiskState, setStatus, setConnectionStatus } from "../client/js/dashboard.js";

// ---- deterministic test doubles: a fake socket and a virtual clock -----------------------------------
class FakeSocket {
  sent: unknown[] = [];
  closeCalls = 0;
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  send(data: string): void {
    this.sent.push(JSON.parse(data));
  }
  close(): void {
    this.closeCalls += 1;
  }
  open(): void {
    this.onopen?.();
  }
  receive(frame: unknown): void {
    this.onmessage?.({ data: typeof frame === "string" ? frame : JSON.stringify(frame) });
  }
  drop(): void {
    this.onclose?.();
  }
}

class FakeClock {
  time = 0;
  private serial = 0;
  private timers = new Map<number, { at: number; fn: () => void }>();
  setTimer = (fn: () => void, ms: number): number => {
    this.serial += 1;
    this.timers.set(this.serial, { at: this.time + ms, fn });
    return this.serial;
  };
  clearTimer = (id: number): void => {
    this.timers.delete(id);
  };
  get pending(): number {
    return this.timers.size;
  }
  advance(ms: number): void {
    const target = this.time + ms;
    for (;;) {
      let nextId = -1;
      let nextAt = Number.POSITIVE_INFINITY;
      for (const [id, timer] of this.timers) {
        if (timer.at <= target && (timer.at < nextAt || (timer.at === nextAt && id < nextId))) {
          nextId = id;
          nextAt = timer.at;
        }
      }
      if (nextId === -1) break;
      const timer = this.timers.get(nextId)!;
      this.timers.delete(nextId);
      this.time = timer.at;
      timer.fn();
    }
    this.time = target;
  }
}

type Delivered = { topic: string; seq: number; kind: string };

function harness(overrides: Record<string, unknown> = {}, randoms: number[] = [0.5]) {
  const clock = new FakeClock();
  const sockets: FakeSocket[] = [];
  const statuses: string[] = [];
  const delivered: Delivered[] = [];
  let randomCalls = 0;
  const failures = { createThrows: 0 };
  const client = new LiveFeedClient({
    url: "ws://feed",
    topics: ["orderbook", "balance"],
    createSocket: () => {
      if (failures.createThrows > 0) {
        failures.createThrows -= 1;
        throw new Error("connect failed");
      }
      const socket = new FakeSocket();
      sockets.push(socket);
      return socket;
    },
    setTimer: clock.setTimer,
    clearTimer: clock.clearTimer,
    random: () => randoms[Math.min(randomCalls++, randoms.length - 1)]!,
    onMessage: (topic: string, message: { seq: number; kind: string }) => delivered.push({ topic, seq: message.seq, kind: message.kind }),
    onStatus: (status: string) => statuses.push(status),
    staleAfterMs: 5000,
    gapTimeoutMs: 1000,
    baseDelayMs: 500,
    maxDelayMs: 4000,
    ...overrides,
  });
  return { client, clock, sockets, statuses, delivered, failures, randomCalls: () => randomCalls };
}

const snapshot = (topic: string, seq: number) => ({ topic, seq, kind: "snapshot", data: {} });
const delta = (topic: string, seq: number) => ({ topic, seq, kind: "delta", data: {} });

describe("Challenge 17: Live Dashboard Updates", () => {
  describe("Challenge 17a: Connection status", () => {
    test("Challenge 17a-1: the feed reports connecting, live and stale at exactly the right moments, and never repeats a status", () => {
      const h = harness();
      h.client.start();
      expect(h.statuses).toEqual(["connecting"]);
      expect(h.sockets).toHaveLength(1);

      h.sockets[0]!.open();
      expect(h.sockets[0]!.sent).toEqual([{ type: "subscribe", topics: ["orderbook", "balance"], resumeFrom: {} }]);
      expect(h.statuses).toEqual(["connecting"]); // open alone is not live

      h.clock.advance(4999);
      expect(h.statuses).toEqual(["connecting"]);
      h.clock.advance(1); // 5000 ms of silence since the socket opened
      expect(h.statuses).toEqual(["connecting", "stale"]);

      h.sockets[0]!.receive({ kind: "heartbeat" });
      expect(h.statuses).toEqual(["connecting", "stale", "live"]);
      h.sockets[0]!.receive({ kind: "heartbeat" });
      h.sockets[0]!.receive("not json at all");
      expect(h.statuses).toEqual(["connecting", "stale", "live"]); // no duplicate "live", junk is ignored

      h.clock.advance(4999);
      h.sockets[0]!.receive({ kind: "heartbeat" }); // resets the silence window
      h.clock.advance(4999);
      expect(h.statuses.at(-1)).toBe("live");
      h.clock.advance(1);
      expect(h.statuses.at(-1)).toBe("stale");
    });
  });

  describe("Challenge 17b: Per-topic ordering", () => {
    test("Challenge 17b-1: messages arriving shuffled and duplicated are delivered once each, in order, per topic", () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 12 }),
          fc.integer({ min: 1, max: 12 }),
          fc.array(fc.nat(1_000_000), { minLength: 1, maxLength: 60 }),
          (nA, nB, keys) => {
            const h = harness();
            h.client.start();
            h.sockets[0]!.open();
            h.sockets[0]!.receive(snapshot("orderbook", 0));
            h.sockets[0]!.receive(snapshot("balance", 0));

            const frames: unknown[] = [];
            for (let i = 1; i <= nA; i += 1) frames.push(delta("orderbook", i), delta("orderbook", i)); // every frame twice
            for (let i = 1; i <= nB; i += 1) frames.push(delta("balance", i));
            const shuffled = frames.map((frame, i) => ({ frame, key: keys[i % keys.length]! * 1000 + i })).sort((a, b) => a.key - b.key);
            for (const { frame } of shuffled) h.sockets[0]!.receive(frame);

            const seqs = (topic: string) => h.delivered.filter((d) => d.topic === topic).map((d) => d.seq);
            expect(seqs("orderbook")).toEqual(Array.from({ length: nA + 1 }, (_, i) => i));
            expect(seqs("balance")).toEqual(Array.from({ length: nB + 1 }, (_, i) => i));

            // Duplicates of delivered messages are dropped outright: they must not be parked as a "gap"
            // that later times out into a spurious resync.
            h.clock.advance(3000);
            expect(h.sockets[0]!.sent).toEqual([{ type: "subscribe", topics: ["orderbook", "balance"], resumeFrom: {} }]);
          },
        ),
      );
    });

    test("Challenge 17b-2: a gap that never fills triggers one resync for that topic only, and deltas are ignored until the next snapshot", () => {
      const h = harness();
      h.client.start();
      const socket = h.sockets[0]!;
      socket.open();
      socket.receive(snapshot("orderbook", 0));
      socket.receive(snapshot("balance", 0));
      socket.receive(delta("orderbook", 1));
      socket.receive(delta("orderbook", 3)); // 2 is missing
      socket.receive(delta("orderbook", 4));
      socket.receive(delta("balance", 1));
      expect(h.delivered.filter((d) => d.topic === "orderbook").map((d) => d.seq)).toEqual([0, 1]);

      h.clock.advance(999);
      expect(socket.sent.filter((f) => (f as { type: string }).type === "resync")).toHaveLength(0);
      h.clock.advance(1);
      expect(socket.sent.filter((f) => (f as { type: string }).type === "resync")).toEqual([{ type: "resync", topic: "orderbook" }]);

      socket.receive(delta("orderbook", 2)); // the very seq that was missing arrives after the resync: still no baseline
      socket.receive(delta("orderbook", 5)); // no baseline until a snapshot
      socket.receive(delta("balance", 2)); // the other topic is unaffected
      expect(h.delivered.filter((d) => d.topic === "orderbook").map((d) => d.seq)).toEqual([0, 1]);
      expect(h.delivered.filter((d) => d.topic === "balance").map((d) => d.seq)).toEqual([0, 1, 2]);

      socket.receive(snapshot("orderbook", 10));
      socket.receive(delta("orderbook", 11));
      expect(h.delivered.filter((d) => d.topic === "orderbook").map((d) => d.seq)).toEqual([0, 1, 10, 11]);

      // A gap that fills in time is delivered in order and never resyncs.
      socket.receive(delta("orderbook", 13));
      h.clock.advance(500);
      socket.receive(delta("orderbook", 12));
      expect(h.delivered.filter((d) => d.topic === "orderbook").map((d) => d.seq)).toEqual([0, 1, 10, 11, 12, 13]);
      h.clock.advance(5000);
      expect(socket.sent.filter((f) => (f as { type: string }).type === "resync")).toHaveLength(1);
    });
  });

  describe("Challenge 17c: Reconnecting", () => {
    test("Challenge 17c-1: reconnect delays follow the capped exponential backoff with jitter exactly, and reset once data flows again", () => {
      fc.assert(
        fc.property(fc.array(fc.double({ min: 0, max: 0.999, noNaN: true }), { minLength: 1, maxLength: 8 }), (randoms) => {
          const h = harness({}, randoms);
          h.client.start();
          h.sockets[0]!.open();

          for (let attempt = 0; attempt < randoms.length; attempt += 1) {
            const cap = Math.min(4000, 500 * 2 ** attempt);
            const delay = Math.floor(cap * (0.5 + 0.5 * randoms[attempt]!));
            const before = h.sockets.length;
            h.sockets[before - 1]!.drop();
            expect(h.statuses.at(-1)).toBe("reconnecting");
            if (delay > 0) h.clock.advance(delay - 1);
            expect(h.sockets).toHaveLength(before);
            h.clock.advance(delay > 0 ? 1 : 0);
            expect(h.sockets).toHaveLength(before + 1);
          }
          expect(h.randomCalls()).toBe(randoms.length);

          // Data flowing again resets the backoff to the base delay.
          const socket = h.sockets.at(-1)!;
          socket.open();
          socket.receive({ kind: "heartbeat" });
          expect(h.statuses.at(-1)).toBe("live");
          const next = randoms[Math.min(randoms.length, randoms.length - 1)]!;
          void next;
          const before = h.sockets.length;
          socket.drop();
          h.clock.advance(500); // cap = base again, so even the largest jitter is <= 500
          expect(h.sockets).toHaveLength(before + 1);
        }),
      );
    });

    test("Challenge 17c-2: a reconnect resubscribes from the last delivered seq, starts without a baseline, retries failed connects, and never reports stale while down", () => {
      const h = harness({}, [0, 0, 0]);
      h.client.start();
      h.sockets[0]!.open();
      h.sockets[0]!.receive(snapshot("orderbook", 4));
      h.sockets[0]!.receive(delta("orderbook", 5));
      h.sockets[0]!.receive(snapshot("balance", 9));

      h.sockets[0]!.drop();
      h.failures.createThrows = 1; // the first reconnect attempt fails outright
      h.clock.advance(250); // attempt 0: floor(500 * 0.5) = 250
      expect(h.sockets).toHaveLength(1);
      h.clock.advance(500); // attempt 1: cap 1000, floor(1000 * 0.5) = 500
      expect(h.sockets).toHaveLength(2);
      h.clock.advance(60_000); // long silence while the socket never opened: still not "stale"
      expect(h.statuses).not.toContain("stale");
      expect(h.statuses.at(-1)).toBe("reconnecting");

      h.sockets[1]!.open();
      expect(h.sockets[1]!.sent).toEqual([{ type: "subscribe", topics: ["orderbook", "balance"], resumeFrom: { orderbook: 5, balance: 9 } }]);
      h.sockets[1]!.receive(delta("orderbook", 6)); // no baseline on the new socket yet
      expect(h.delivered.filter((d) => d.topic === "orderbook").map((d) => d.seq)).toEqual([4, 5]);
      h.sockets[1]!.receive(snapshot("orderbook", 20));
      expect(h.delivered.filter((d) => d.topic === "orderbook").map((d) => d.seq)).toEqual([4, 5, 20]);
      expect(h.statuses.at(-1)).toBe("live");
    });
  });

  describe("Challenge 17d: Stopping", () => {
    test("Challenge 17d-1: stop closes the socket once, cancels every timer, ignores late frames and never reconnects", () => {
      const h = harness();
      h.client.start();
      h.sockets[0]!.open();
      h.sockets[0]!.receive(snapshot("orderbook", 0));
      h.client.stop();
      h.client.stop();
      expect(h.sockets[0]!.closeCalls).toBe(1);
      expect(h.statuses.filter((s) => s === "stopped")).toHaveLength(1);
      expect(h.clock.pending).toBe(0);

      h.sockets[0]!.receive(delta("orderbook", 1));
      h.sockets[0]!.drop();
      h.clock.advance(120_000);
      expect(h.delivered).toHaveLength(1);
      expect(h.sockets).toHaveLength(1);
      expect(h.statuses.at(-1)).toBe("stopped");

      // Stopping while a reconnect is pending cancels it.
      const g = harness();
      g.client.start();
      g.sockets[0]!.open();
      g.sockets[0]!.drop();
      expect(g.clock.pending).toBe(1);
      g.client.stop();
      expect(g.clock.pending).toBe(0);
      g.clock.advance(120_000);
      expect(g.sockets).toHaveLength(1);
    });
  });

  describe("Challenge 17e: Applying order-book deltas", () => {
    test("Challenge 17e-1: applying a delta stream matches an independent model, never mutates its input, and rejects invalid deltas", () => {
      const bookArb = fc.record({
        bids: fc.uniqueArray(fc.integer({ min: 1, max: 60 }), { maxLength: 8 }),
        asks: fc.uniqueArray(fc.integer({ min: 1, max: 60 }), { maxLength: 8 }),
      });
      const deltaArb = fc.array(fc.record({ side: fc.constantFrom("bids", "asks"), price: fc.integer({ min: 1, max: 60 }), quantity: fc.integer({ min: 0, max: 9 }) }), { maxLength: 30 });
      fc.assert(
        fc.property(bookArb, deltaArb, (seed, deltas) => {
          const start = {
            bids: seed.bids.map((price) => ({ price: String(price), quantity: "7" })),
            asks: seed.asks.map((price) => ({ price: String(price), quantity: "7" })),
          };
          const model = { bids: new Map<string, string>(start.bids.map((l) => [l.price, l.quantity])), asks: new Map<string, string>(start.asks.map((l) => [l.price, l.quantity])) };
          let book = JSON.parse(JSON.stringify(start)) as typeof start;
          for (const d of deltas) {
            const frozen = JSON.stringify(book);
            const next = applyOrderBookDelta(book, { side: d.side, price: String(d.price), quantity: String(d.quantity) });
            expect(JSON.stringify(book)).toBe(frozen); // input untouched

            if (d.quantity === 0) model[d.side].delete(String(d.price));
            else model[d.side].set(String(d.price), String(d.quantity));
            const expectSide = (side: "bids" | "asks") =>
              [...model[side].entries()].sort((a, b) => (side === "bids" ? Number(b[0]) - Number(a[0]) : Number(a[0]) - Number(b[0]))).map(([price, quantity]) => ({ price, quantity }));
            expect(next.bids).toEqual(expectSide("bids"));
            expect(next.asks).toEqual(expectSide("asks"));
            book = next;
          }
        }),
      );

      const empty = { bids: [], asks: [] };
      expect(applyOrderBookDelta(empty, { side: "bids", price: "100", quantity: "007" }).bids).toEqual([{ price: "100", quantity: "7" }]);
      for (const bad of [
        { side: "left", price: "1", quantity: "1" },
        { side: "bids", price: "0", quantity: "1" },
        { side: "bids", price: "01", quantity: "1" },
        { side: "bids", price: "1.5", quantity: "1" },
        { side: "bids", price: "1", quantity: "-1" },
        { side: "bids", price: "1", quantity: "" },
        { side: "asks", price: 5, quantity: "1" },
      ]) {
        expect(() => applyOrderBookDelta(empty, bad as never)).toThrow(RangeError);
      }
    });
  });

  describe("Challenge 17f: The dashboard shows the connection state", () => {
    const page = () =>
      new JSDOM(`<!doctype html><body><p id="connection-status"></p><section id="balance-view"></section><section id="orderbook-view"></section><section id="risk-view"></section></body>`).window.document;

    test("Challenge 17f-1: stale and reconnecting keep the old data on screen with a note, live restores it, and loading/empty/error panels are left alone", () => {
      const doc = page();
      renderBalance(doc, [{ asset: "USD", available: "10", held: "0", total: "10" }]);
      renderOrderBook(doc, { bids: [{ price: "100", quantity: "5" }], asks: [] });
      setStatus(doc, "risk-view", "error", "Could not load risk state");
      const balance = doc.getElementById("balance-view")!;
      const book = doc.getElementById("orderbook-view")!;
      const risk = doc.getElementById("risk-view")!;

      setConnectionStatus(doc, "stale");
      const banner = doc.getElementById("connection-status")!;
      expect(banner.dataset.state).toBe("stale");
      expect(banner.textContent?.trim()).not.toBe("");
      expect(balance.dataset.state).toBe("stale");
      expect(book.dataset.state).toBe("stale");
      expect(balance.querySelector("table")).not.toBeNull(); // the old data is still there
      expect(book.querySelector(".bids .best")?.textContent).toContain("100");
      expect(balance.querySelectorAll(".stale-note")).toHaveLength(1);
      expect(book.querySelectorAll(".stale-note")).toHaveLength(1);
      expect(risk.dataset.state).toBe("error");
      expect(risk.textContent).toBe("Could not load risk state");
      expect(risk.querySelector(".stale-note")).toBeNull();

      setConnectionStatus(doc, "stale"); // repeating it must not pile up notes
      expect(balance.querySelectorAll(".stale-note")).toHaveLength(1);

      setConnectionStatus(doc, "reconnecting");
      expect(banner.dataset.state).toBe("reconnecting");
      expect(balance.dataset.state).toBe("reconnecting");
      expect(balance.querySelectorAll(".stale-note")).toHaveLength(1);
      expect(balance.querySelector("table")).not.toBeNull();

      setConnectionStatus(doc, "live");
      expect(banner.dataset.state).toBe("live");
      expect(balance.dataset.state).toBe("ready");
      expect(book.dataset.state).toBe("ready");
      expect(balance.querySelector(".stale-note")).toBeNull();
      expect(balance.querySelector("table")).not.toBeNull();
      expect(risk.dataset.state).toBe("error");

      // A fresh render while stale replaces the panel and clears the note; a custom message is shown.
      setConnectionStatus(doc, "stopped");
      expect(balance.dataset.state).toBe("stale");
      renderBalance(doc, [{ asset: "EUR", available: "1", held: "0", total: "1" }]);
      expect(balance.dataset.state).toBe("ready");
      expect(balance.querySelector(".stale-note")).toBeNull();
      setStatus(doc, "balance-view", "stale", "Feed lost 12s ago");
      expect(balance.querySelector(".stale-note")?.textContent).toBe("Feed lost 12s ago");
      expect(balance.querySelector("table")).not.toBeNull();
      setStatus(doc, "balance-view", "ready");
      expect(balance.querySelector(".stale-note")).toBeNull();

      renderRiskState(doc, { openOrderCount: 1, committedExposure: "5" });
      setConnectionStatus(doc, "connecting"); // connecting changes no panel
      expect(doc.getElementById("connection-status")!.dataset.state).toBe("connecting");
      expect(risk.dataset.state).toBe("ready");
    });
  });
});
