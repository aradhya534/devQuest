import express from "express";
import marketDataController from "../controller/marketDataController.js";
import asyncHandler from "../middleware/asyncHandler.js";

const router = express.Router();

router.post("/candles", asyncHandler(marketDataController.candles));
router.post("/vwap", asyncHandler(marketDataController.vwap));

export default router;
