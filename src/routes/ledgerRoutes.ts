import express from "express";
import ledgerController from "../controller/ledgerController.js";
import asyncHandler from "../middleware/asyncHandler.js";
import { requireRole, requireOwnAccountParam } from "../middleware/rbac.js";

const router = express.Router();

router.get("/accounts", asyncHandler(ledgerController.listAccounts));
router.post("/accounts", asyncHandler(ledgerController.createAccount));
router.post("/accounts/:accountId/close", requireRole("admin"), asyncHandler(ledgerController.close));
router.get("/accounts/:accountId/balance", requireOwnAccountParam("accountId"), asyncHandler(ledgerController.getBalance));
router.get("/accounts/:accountId/statement", requireOwnAccountParam("accountId"), asyncHandler(ledgerController.getStatement));

router.post("/entries", asyncHandler(ledgerController.createEntry));
router.post("/entries/:entryId/reverse", asyncHandler(ledgerController.reverse));
router.get("/trial-balance", asyncHandler(ledgerController.getTrialBalance));

export default router;
