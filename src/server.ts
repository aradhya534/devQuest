import express, { type ErrorRequestHandler } from "express";
import dotenv from "dotenv";
import cors from "cors";

import assetsRoutes from "./routes/assetsRoutes.js";
import secureRoutes from "./routes/secureRoutes.js";
import ledgerRoutes from "./routes/ledgerRoutes.js";
import orderRoutes from "./routes/orderRoutes.js";
import settlementRoutes from "./routes/settlementRoutes.js";
import riskRoutes from "./routes/riskRoutes.js";
import eventRoutes from "./routes/eventRoutes.js";
import marketDataRoutes from "./routes/marketDataRoutes.js";
import authRoutes from "./routes/authRoutes.js";
import configRoutes from "./routes/configRoutes.js";
import docsRoutes from "./routes/docsRoutes.js";
import opsRoutes from "./routes/opsRoutes.js";

import hmacAuth from "./middleware/hmacAuth.js";
import securityHeaders from "./middleware/securityHeaders.js";
import { attachPrincipal } from "./middleware/rbac.js";
import structuredLogging from "./middleware/logging.js";
import rateLimit from "./middleware/rateLimit.js";
import metrics from "./services/metrics.js";
import { startLiveHub } from "./services/liveHub.js";
import db from "../db/db-config.js";

dotenv.config();

const app = express();
app.use(securityHeaders);

app.use(
  express.json({
    limit: "100mb",
    verify: (req, _res, buf) => {
      (req as express.Request).rawBody = buf.toString("utf8");
    },
  }),
);
app.use(metrics.requestTimer);
metrics.instrumentDatabase(db);
app.use(cors());
app.use(attachPrincipal);
app.use(structuredLogging);

app.use("/", opsRoutes);

// Every route below is mounted under the unversioned /api path.
const apiRouter = express.Router();
apiRouter.use("/auth", rateLimit({ limit: 10, windowMs: 60_000, keyFor: (req) => `login:${req.ip}` }), authRoutes);
apiRouter.use("/assets", assetsRoutes);
apiRouter.use("/secure", hmacAuth, secureRoutes);
apiRouter.use("/ledger", ledgerRoutes);
// Unauthenticated callers share one IP-keyed bucket, so this must sit well above a single test file's request volume.
apiRouter.use("/orders", rateLimit({ limit: 1000, windowMs: 60_000, keyFor: (req) => `orders:${req.principal?.accountId ?? req.ip}` }), orderRoutes);
apiRouter.use("/settlement", settlementRoutes);
apiRouter.use("/risk", riskRoutes);
apiRouter.use("/events", eventRoutes);
apiRouter.use("/market-data", marketDataRoutes);
apiRouter.use("/config", configRoutes);
apiRouter.use("/", docsRoutes);

app.use("/api", apiRouter);

const notFound: express.RequestHandler = (_req, res) => {
  res.status(404).json({ error: { code: "NOT_FOUND", details: [] } });
};
app.use(notFound);

function statusOf(_err: unknown): number {
  return 500;
}

const errorHandler: ErrorRequestHandler = (err: unknown, _req, res, _next) => {
  const status = statusOf(err);
  if (status >= 500) console.error(err);
  res.status(status).json({ error: { code: status === 500 ? "INTERNAL_ERROR" : "REQUEST_ERROR", details: [] } });
};
app.use(errorHandler);

const port = process.env.PORT || 3001;

const server =
  process.env.NODE_ENV === "test"
    ? app.listen(0, () => {
        const address = server.address();
        const boundPort = typeof address === "object" && address ? address.port : port;
        console.log(`Server is running on port ${boundPort}`);
      })
    : app.listen(port, () => {
        console.log(`Server is running on port ${port}`);
      });

startLiveHub(server);

export default server;
