import express from "express";
import orderController from "../controller/orderController.js";
import asyncHandler from "../middleware/asyncHandler.js";

const router = express.Router();

router.post("/", asyncHandler(orderController.create));
router.delete("/:orderId", asyncHandler(orderController.remove));
router.patch("/:orderId", asyncHandler(orderController.amend));
router.get("/trades", asyncHandler(orderController.recentTrades));
router.get("/book/:market", asyncHandler(orderController.bookSnapshot));
router.get("/book/:market/depth", asyncHandler(orderController.bookDepth));

export default router;
