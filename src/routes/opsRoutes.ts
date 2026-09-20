import express from "express";
import opsController from "../controller/opsController.js";
import asyncHandler from "../middleware/asyncHandler.js";

const router = express.Router();

router.get("/health", asyncHandler(opsController.health));
router.get("/ready", asyncHandler(opsController.ready));
router.get("/api/metrics", asyncHandler(opsController.getMetrics));

export default router;
