import express from "express";
import eventController from "../controller/eventController.js";
import asyncHandler from "../middleware/asyncHandler.js";

const router = express.Router();

router.post("/deposits", asyncHandler(eventController.recordDeposit));
router.get("/rebuild", asyncHandler(eventController.rebuild));
router.post("/snapshots", asyncHandler(eventController.createSnapshot));
router.get("/state", asyncHandler(eventController.stateAt));
router.get("/verify", asyncHandler(eventController.verify));

export default router;
