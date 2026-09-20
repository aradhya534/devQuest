import type { Request, Response, NextFunction } from "express";
import type { Knex } from "knex";

const SLOW_QUERY_MS = 50;
const MAX_TRACKED_ENDPOINTS = 100;

interface EndpointStat {
  endpoint: string;
  requestCount: number;
  totalTime: number;
  errorCount: number;
}

const endpoints = new Map<string, EndpointStat>();
const database = { totalQueries: 0, totalQueryTime: 0, slowQueries: 0 };

const requestTotals = { count: 0, totalTime: 0, errors: 0 };

const endpointKey = (req: Request): string => `${req.method} ${req.route?.path ?? req.baseUrl ?? req.path}`;

const recordRequest = (key: string, durationMs: number, statusCode: number): void => {
  requestTotals.count += 1;
  requestTotals.totalTime += durationMs;
  if (statusCode >= 500) requestTotals.errors += 1;

  if (!endpoints.has(key) && endpoints.size >= MAX_TRACKED_ENDPOINTS) return;

  const stat = endpoints.get(key) ?? { endpoint: key, requestCount: 0, totalTime: 0, errorCount: 0 };
  stat.requestCount += 1;
  stat.totalTime += durationMs;
  if (statusCode >= 400) stat.errorCount += 1;
  endpoints.set(key, stat);
};

const requestTimer = (req: Request, res: Response, next: NextFunction): void => {
  const startedAt = process.hrtime.bigint();

  res.once("finish", () => {
    const durationMs = Number(process.hrtime.bigint() - startedAt) / 1e6;
    recordRequest(endpointKey(req), durationMs, res.statusCode);
  });

  next();
};

const recordQuery = (durationMs: number): void => {
  database.totalQueries += 1;
  database.totalQueryTime += durationMs;
  if (durationMs >= SLOW_QUERY_MS) database.slowQueries += 1;
};

interface KnexQueryEvent {
  __knexQueryUid: string | number;
}

const instrumentDatabase = (knexInstance: Knex): Knex => {
  const started = new Map<string | number, bigint>();

  knexInstance.on("query", (query: KnexQueryEvent) => {
    started.set(query.__knexQueryUid, process.hrtime.bigint());
  });

  const settle = (query: KnexQueryEvent | undefined): void => {
    if (query === undefined) return;
    const startedAt = started.get(query.__knexQueryUid);
    if (startedAt === undefined) return;
    started.delete(query.__knexQueryUid);
    recordQuery(Number(process.hrtime.bigint() - startedAt) / 1e6);
  };

  knexInstance.on("query-response", (_response: unknown, query: KnexQueryEvent) => settle(query));
  knexInstance.on("query-error", (_error: unknown, query: KnexQueryEvent) => settle(query));

  return knexInstance;
};

const round = (value: number, decimals: number = 3): number => Number(value.toFixed(decimals));

const healthScore = (averageResponseTime: number, errorRate: number): number => {
  const latencyPenalty = Math.min(50, (averageResponseTime / 500) * 50);
  const errorPenalty = Math.min(50, errorRate * 50);
  return Math.max(0, Math.min(100, Math.round(100 - latencyPenalty - errorPenalty)));
};

const snapshot = () => {
  const memory = process.memoryUsage();

  const averageResponseTime = requestTotals.count > 0 ? requestTotals.totalTime / requestTotals.count : 1;
  const errorRate = requestTotals.count > 0 ? requestTotals.errors / requestTotals.count : 0;

  return {
    averageResponseTime: round(Math.max(averageResponseTime, 0.001)),
    totalRequests: requestTotals.count,
    errorRate: round(errorRate, 4),
    databaseMetrics: {
      averageQueryTime: database.totalQueries > 0 ? round(database.totalQueryTime / database.totalQueries) : 0,
      totalQueries: database.totalQueries,
      slowQueries: database.slowQueries,
    },
    memoryUsage: {
      used: memory.heapUsed,
      total: Math.max(memory.heapTotal, memory.heapUsed + 1),
      rss: memory.rss,
    },
    endpointStats: Array.from(endpoints.values())
      .map((stat) => ({
        endpoint: stat.endpoint,
        requestCount: stat.requestCount,
        averageResponseTime: round(stat.totalTime / stat.requestCount),
        errorRate: round(stat.errorCount / stat.requestCount, 4),
      }))
      .sort((a, b) => b.requestCount - a.requestCount),
    healthScore: healthScore(averageResponseTime, errorRate),
    uptimeSeconds: round(process.uptime(), 1),
  };
};

export default { requestTimer, instrumentDatabase, snapshot };
