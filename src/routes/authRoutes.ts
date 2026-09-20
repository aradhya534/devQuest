import express from "express";
import authController from "../controller/authController.js";
import asyncHandler from "../middleware/asyncHandler.js";

const router = express.Router();

router.post("/login", asyncHandler(authController.login));
router.post("/refresh", asyncHandler(authController.refresh));

export default router;
