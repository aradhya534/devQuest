import type { Server } from "node:http";
import { NotImplementedError } from "../domain/notImplemented.js";

export interface HubPrincipal {
  accountId: string;
  role: "operator" | "admin";
}

export interface HubOptions {
  server: Server;
  path: string;
  authenticate: (token: string | undefined) => HubPrincipal | null;
  authorize: (principal: HubPrincipal, topic: string) => "ok" | "forbidden" | "unknown";
  snapshot: (topic: string) => unknown;
  heartbeatIntervalMs?: number;
  maxBufferedBytes?: number;
}

/** A WebSocket hub that streams topics to authenticated clients. See tests/challenge18.test.ts. */
export class WebSocketHub {
  constructor(_options: HubOptions) {
    throw new NotImplementedError("WebSocketHub");
  }

  publish(_topic: string, _data: unknown): number {
    throw new NotImplementedError("WebSocketHub.publish");
  }

  disconnectAll(_code?: number): void {
    throw new NotImplementedError("WebSocketHub.disconnectAll");
  }

  connectionCount(): number {
    throw new NotImplementedError("WebSocketHub.connectionCount");
  }

  close(): Promise<void> {
    throw new NotImplementedError("WebSocketHub.close");
  }
}
