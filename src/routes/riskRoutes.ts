import express from "express";
import riskController from "../controller/riskController.js";
import asyncHandler from "../middleware/asyncHandler.js";
import { requireRole } from "../middleware/rbac.js";

const router = express.Router();

router.post("/limits", asyncHandler(riskController.setLimits));
router.get("/accounts/:accountId/state", asyncHandler(riskController.getState));
router.post("/kill-switch", requireRole("admin"), asyncHandler(riskController.setKillSwitch));

export default router;
