import fc from "fast-check";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { WebSocket } from "ws";
import { expect, test, describe, afterEach } from "vitest";
import { WebSocketHub, type HubPrincipal } from "../src/services/wsHub.js";
import { diffDepth, type Depth } from "../src/services/marketFeed.js";

// These tests run the real hub on a real HTTP server and talk to it with a real WebSocket client.

const TOKENS: Record<string, HubPrincipal> = {
  alice: { accountId: "alice", role: "operator" },
  bob: { accountId: "bob", role: "operator" },
  root: { accountId: "root", role: "admin" },
};

type Frame = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

class Client {
  readonly ws: WebSocket;
  readonly frames: Frame[] = [];
  closeCode: number | null = null;

  constructor(url: string, options: ConstructorParameters<typeof WebSocket>[2] = {}) {
    this.ws = new WebSocket(url, options);
    this.ws.on("message", (data) => this.frames.push(JSON.parse(data.toString())));
    this.ws.on("close", (code) => (this.closeCode = code));
    this.ws.on("error", () => undefined);
  }

  open(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.ws.readyState === WebSocket.OPEN) return resolve();
      this.ws.once("open", () => resolve());
      this.ws.once("close", () => reject(new Error("closed before opening")));
    });
  }

  send(message: unknown): void {
    this.ws.send(typeof message === "string" ? message : JSON.stringify(message));
  }

  async waitFor(predicate: (frames: Frame[]) => boolean, timeoutMs = 3000): Promise<void> {
    const started = Date.now();
    while (!predicate(this.frames)) {
      if (Date.now() - started > timeoutMs) throw new Error(`timed out; frames so far: ${JSON.stringify(this.frames).slice(0, 400)}`);
      await sleep(5);
    }
  }

  deltas(topic: string): Frame[] {
    return this.frames.filter((f) => f.topic === topic && f.kind === "delta");
  }
}

const running: { stop: () => Promise<void> }[] = [];
const clients: Client[] = [];

async function startHub(overrides: Partial<ConstructorParameters<typeof WebSocketHub>[0]> = {}) {
  const server = http.createServer();
  const values = new Map<string, number>();
  const hub = new WebSocketHub({
    server,
    path: "/ws",
    authenticate: (token) => (token ? (TOKENS[token] ?? null) : null),
    authorize: (principal, topic) => (topic.startsWith("book:") ? "ok" : topic.startsWith("acct:") ? (topic === `acct:${principal.accountId}` || principal.role === "admin" ? "ok" : "forbidden") : "unknown"),
    snapshot: (topic) => ({ topic, value: values.get(topic) ?? 0 }),
    heartbeatIntervalMs: 50,
    maxBufferedBytes: 256 * 1024,
    ...overrides,
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as AddressInfo).port;
  const handle = {
    hub,
    values,
    url: (token?: string) => `ws://127.0.0.1:${port}/ws${token ? `?token=${token}` : ""}`,
    stop: async () => {
      await hub.close().catch(() => undefined);
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
  running.push(handle);
  return handle;
}

async function connect(url: string, options: ConstructorParameters<typeof WebSocket>[2] = {}): Promise<Client> {
  const client = new Client(url, options);
  clients.push(client);
  await client.open();
  return client;
}

function rejectionStatus(url: string): Promise<number> {
  return new Promise((resolve) => {
    const ws = new WebSocket(url);
    ws.on("unexpected-response", (_request, response) => resolve(response.statusCode ?? 0));
    ws.on("open", () => {
      ws.close();
      resolve(0);
    });
    ws.on("error", () => undefined);
  });
}

afterEach(async () => {
  for (const client of clients.splice(0)) client.ws.terminate();
  for (const handle of running.splice(0)) await handle.stop();
});

describe("Challenge 18: The WebSocket Feed", () => {
  describe("Challenge 18a: Handshake and subscriptions", () => {
    test("Challenge 18a-1: only a valid token opens a connection; anything else is refused with 401 before the upgrade", async () => {
      const { hub, url } = await startHub();

      expect(await rejectionStatus(url())).toBe(401);
      expect(await rejectionStatus(url("not-a-token"))).toBe(401);
      expect(hub.connectionCount()).toBe(0);

      await connect(url("alice"));
      await connect(url("bob"));
      expect(hub.connectionCount()).toBe(2);
    });

    test("Challenge 18a-2: subscribing returns a snapshot per allowed topic, an error per forbidden or unknown one, and survives malformed messages", async () => {
      const { url, values } = await startHub();
      values.set("book:X", 42);
      const client = await connect(url("alice"));

      client.send({ type: "subscribe", topics: ["book:X", "acct:alice", "acct:bob", "weird:1"] });
      await client.waitFor((f) => f.some((x) => x.type === "subscribed"));

      expect(client.frames.filter((f) => f.kind === "snapshot")).toEqual([
        { topic: "book:X", seq: 0, kind: "snapshot", data: { topic: "book:X", value: 42 } },
        { topic: "acct:alice", seq: 0, kind: "snapshot", data: { topic: "acct:alice", value: 0 } },
      ]);
      expect(client.frames.find((f) => f.type === "subscribed")).toEqual({ type: "subscribed", topics: ["book:X", "acct:alice"] });
      expect(client.frames.find((f) => f.topic === "acct:bob")).toMatchObject({ type: "error", code: "FORBIDDEN" });
      expect(client.frames.find((f) => f.topic === "weird:1")).toMatchObject({ type: "error", code: "UNKNOWN_TOPIC" });

      client.send("this is not json");
      await client.waitFor((f) => f.some((x) => x.type === "error" && x.code === "BAD_MESSAGE"));
      client.send({ type: "subscribe", topics: ["book:Y"] });
      await client.waitFor((f) => f.filter((x) => x.type === "subscribed").length === 2);
      expect(client.ws.readyState).toBe(WebSocket.OPEN);

      const admin = await connect(url("root"));
      admin.send({ type: "subscribe", topics: ["acct:bob"] });
      await admin.waitFor((f) => f.some((x) => x.type === "subscribed"));
      expect(admin.frames.find((f) => f.kind === "snapshot")?.topic).toBe("acct:bob");
    });
  });

  describe("Challenge 18b: Ordered delivery", () => {
    test("Challenge 18b-1: each topic has its own gapless, increasing sequence, and a late subscriber's snapshot joins it seamlessly", async () => {
      await fc.assert(
        fc.asyncProperty(fc.array(fc.constantFrom("pubA", "pubA", "pubB", "join"), { minLength: 3, maxLength: 25 }), async (operations) => {
          const { hub, url } = await startHub();
          const joined: { client: Client; publishedBefore: number }[] = [];
          const published = { A: 0, B: 0 };

          const first = await connect(url("alice"));
          first.send({ type: "subscribe", topics: ["book:A", "book:B"] });
          await first.waitFor((f) => f.some((x) => x.type === "subscribed"));
          joined.push({ client: first, publishedBefore: 0 });

          for (const operation of operations) {
            if (operation === "join") {
              const late = await connect(url("bob"));
              late.send({ type: "subscribe", topics: ["book:A"] });
              await late.waitFor((f) => f.some((x) => x.type === "subscribed"));
              joined.push({ client: late, publishedBefore: published.A });
            } else {
              const topic = operation === "pubA" ? "book:A" : "book:B";
              const seq = hub.publish(topic, { n: published.A + published.B });
              published[operation === "pubA" ? "A" : "B"] += 1;
              expect(seq).toBe(operation === "pubA" ? published.A : published.B);
            }
          }

          for (const { client, publishedBefore } of joined) {
            await client.waitFor((f) => f.filter((x) => x.topic === "book:A" && x.kind === "delta").length === published.A - publishedBefore);
            const frames = client.frames.filter((f) => f.topic === "book:A" && (f.kind === "snapshot" || f.kind === "delta"));
            expect(frames[0]!.kind).toBe("snapshot");
            expect(frames[0]!.seq).toBe(publishedBefore);
            frames.forEach((frame, i) => expect(frame.seq).toBe(publishedBefore + i));
          }
          await Promise.all(running.splice(0).map((handle) => handle.stop()));
        }),
        { numRuns: 8 },
      );
    });

    test("Challenge 18b-2: a resync request returns a fresh snapshot at the current sequence, and only for a subscribed topic", async () => {
      const { hub, url, values } = await startHub();
      const client = await connect(url("alice"));
      client.send({ type: "subscribe", topics: ["book:X"] });
      await client.waitFor((f) => f.some((x) => x.type === "subscribed"));

      for (let i = 0; i < 5; i += 1) hub.publish("book:X", { i });
      values.set("book:X", 99);
      client.send({ type: "resync", topic: "book:X" });
      await client.waitFor((f) => f.filter((x) => x.kind === "snapshot").length === 2);
      expect(client.frames.filter((f) => f.kind === "snapshot")[1]).toEqual({ topic: "book:X", seq: 5, kind: "snapshot", data: { topic: "book:X", value: 99 } });

      client.send({ type: "resync", topic: "book:NOT-SUBSCRIBED" });
      await client.waitFor((f) => f.some((x) => x.type === "error" && x.code === "NOT_SUBSCRIBED"));
    });
  });

  describe("Challenge 18c: Liveness and backpressure", () => {
    test("Challenge 18c-1: idle clients receive heartbeats, and a client that stops answering pings is dropped while a healthy one stays", async () => {
      const { hub, url } = await startHub({ heartbeatIntervalMs: 40 });
      const healthy = await connect(url("alice"));
      const silent = await connect(url("bob"), { autoPong: false });

      await sleep(450);

      expect(silent.closeCode).not.toBeNull();
      expect(healthy.ws.readyState).toBe(WebSocket.OPEN);
      expect(hub.connectionCount()).toBe(1);
      expect(healthy.frames.filter((f) => f.kind === "heartbeat").length).toBeGreaterThanOrEqual(4);
    });

    test("Challenge 18c-2: a consumer that stops reading is cut loose instead of buffering without bound, and everyone else keeps receiving every message", async () => {
      const { hub, url } = await startHub({ heartbeatIntervalMs: 5000, maxBufferedBytes: 256 * 1024 });
      const healthy = await connect(url("alice"));
      const slow = await connect(url("bob"));
      for (const client of [healthy, slow]) {
        client.send({ type: "subscribe", topics: ["book:X"] });
        await client.waitFor((f) => f.some((x) => x.type === "subscribed"));
      }
      (slow.ws as unknown as { _socket: { pause: () => void } })._socket.pause();

      const payload = "x".repeat(64 * 1024);
      // Publish at the pace the healthy client can read, so only the client that stopped reading falls behind.
      for (let i = 0; i < 400; i += 1) {
        hub.publish("book:X", { i, payload });
        if (i % 5 === 4) await healthy.waitFor((f) => f.filter((x) => x.kind === "delta").length >= i - 3, 8000);
      }

      const started = Date.now();
      while (hub.connectionCount() !== 1 && Date.now() - started < 3000) await sleep(20);
      expect(hub.connectionCount()).toBe(1);

      await healthy.waitFor((f) => f.filter((x) => x.kind === "delta").length === 400, 8000);
      healthy.deltas("book:X").forEach((frame, i) => expect(frame.seq).toBe(i + 1));
    });
  });

  describe("Challenge 18d: Shutdown", () => {
    test("Challenge 18d-1: disconnectAll drops every client with 1012 and keeps accepting new ones; close ends everything with 1001", async () => {
      const { hub, url } = await startHub();
      const first = [await connect(url("alice")), await connect(url("bob")), await connect(url("root"))];
      hub.disconnectAll();
      const started = Date.now();
      while (first.some((c) => c.closeCode === null) && Date.now() - started < 2000) await sleep(10);
      expect(first.map((c) => c.closeCode)).toEqual([1012, 1012, 1012]);
      expect(hub.connectionCount()).toBe(0);

      const again = await connect(url("alice"));
      expect(hub.connectionCount()).toBe(1);
      await hub.close();
      const closedAt = Date.now();
      while (again.closeCode === null && Date.now() - closedAt < 2000) await sleep(10);
      expect(again.closeCode).toBe(1001);
      expect(hub.connectionCount()).toBe(0);
    });
  });

  describe("Challenge 18e: Fan-out", () => {
    test("Challenge 18e-1: thirty subscribers each receive a hundred rapid publishes complete and in order", async () => {
      const { hub, url } = await startHub();
      const many: Client[] = [];
      for (let i = 0; i < 30; i += 1) {
        const client = await connect(url(i % 2 === 0 ? "alice" : "bob"));
        client.send({ type: "subscribe", topics: ["book:X"] });
        many.push(client);
      }
      for (const client of many) await client.waitFor((f) => f.some((x) => x.type === "subscribed"));

      const started = Date.now();
      for (let i = 0; i < 100; i += 1) hub.publish("book:X", { i });
      for (const client of many) await client.waitFor((f) => f.filter((x) => x.kind === "delta").length === 100, 5000);

      expect(Date.now() - started).toBeLessThan(4000);
      for (const client of many) client.deltas("book:X").forEach((frame, i) => expect(frame).toMatchObject({ seq: i + 1, data: { i } }));
    });
  });

  describe("Challenge 18f: Book deltas", () => {
    test("Challenge 18f-1: diffDepth returns exactly the changed levels, with quantity 0 for removed ones, so applying them rebuilds the new book", () => {
      const levels = fc.uniqueArray(fc.tuple(fc.integer({ min: 1, max: 12 }), fc.integer({ min: 1, max: 9 })), { selector: (l) => l[0], maxLength: 8 });
      const toDepth = (bids: number[][], asks: number[][]): Depth => ({
        bids: bids.map(([p, q]) => ({ price: String(p), quantity: String(q) })),
        asks: asks.map(([p, q]) => ({ price: String(p), quantity: String(q) })),
      });
      fc.assert(
        fc.property(levels, levels, levels, levels, (b1, a1, b2, a2) => {
          const before = toDepth(b1, a1);
          const after = toDepth(b2, a2);
          const deltas = diffDepth(before, after);

          const rebuilt: Record<"bids" | "asks", Map<string, string>> = {
            bids: new Map(before.bids.map((l) => [l.price, l.quantity])),
            asks: new Map(before.asks.map((l) => [l.price, l.quantity])),
          };
          for (const delta of deltas) {
            if (delta.quantity === "0") rebuilt[delta.side].delete(delta.price);
            else rebuilt[delta.side].set(delta.price, delta.quantity);
          }
          expect(rebuilt.bids).toEqual(new Map(after.bids.map((l) => [l.price, l.quantity])));
          expect(rebuilt.asks).toEqual(new Map(after.asks.map((l) => [l.price, l.quantity])));

          let differing = 0;
          for (const side of ["bids", "asks"] as const) {
            const previous = new Map(before[side].map((l) => [l.price, l.quantity]));
            const current = new Map(after[side].map((l) => [l.price, l.quantity]));
            for (const price of new Set([...previous.keys(), ...current.keys()])) if (previous.get(price) !== current.get(price)) differing += 1;
          }
          expect(deltas).toHaveLength(differing);
          expect(diffDepth(after, after)).toEqual([]);
        }),
      );
    });
  });
});
