import express from "express";
import settlementController from "../controller/settlementController.js";
import asyncHandler from "../middleware/asyncHandler.js";

const router = express.Router();

router.get("/accounts/:accountId/balance", asyncHandler(settlementController.getBalance));
router.post("/holds", asyncHandler(settlementController.hold));
router.post("/releases", asyncHandler(settlementController.release));
router.post("/deposits", asyncHandler(settlementController.deposit));
router.post("/withdrawals", asyncHandler(settlementController.withdraw));
router.post("/trades", asyncHandler(settlementController.settleTrade));

export default router;
