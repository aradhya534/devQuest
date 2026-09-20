import type { Server } from "node:http";
import * as engine from "./matchingEngine.js";
import * as risk from "./riskRegistry.js";
import { verifyAccessToken } from "../domain/session.js";
import { WebSocketHub, type HubPrincipal } from "./wsHub.js";

// Wires the WebSocket hub into the running server: who may connect, which topics exist, what a snapshot holds.
// If the hub is not implemented yet the server simply runs without live updates.
let hub: WebSocketHub | null = null;

function authenticate(token: string | undefined): HubPrincipal | null {
  if (!token) return null;
  try {
    return verifyAccessToken(token);
  } catch {
    return null;
  }
}

function authorize(principal: HubPrincipal, topic: string): "ok" | "forbidden" | "unknown" {
  if (topic.startsWith("orderbook:") || topic === "trades") return "ok";
  if (topic.startsWith("risk:")) return principal.role === "admin" || topic === `risk:${principal.accountId}` ? "ok" : "forbidden";
  return "unknown";
}

function snapshot(topic: string): unknown {
  if (topic.startsWith("orderbook:")) return engine.depth(topic.slice("orderbook:".length));
  if (topic === "trades") return engine.recentTrades(20);
  const accountId = topic.slice("risk:".length);
  const state = risk.getState(accountId);
  return { openOrderCount: state.openOrderCount, committedExposure: state.committedExposure.toString() };
}

export function startLiveHub(server: Server): void {
  try {
    hub = new WebSocketHub({ server, path: "/ws", authenticate, authorize, snapshot });
  } catch {
    hub = null;
  }
}

export function publish(topic: string, data: unknown): void {
  hub?.publish(topic, data);
}

export function disconnectAll(): void {
  hub?.disconnectAll();
}

export function connectionCount(): number {
  return hub?.connectionCount() ?? 0;
}
