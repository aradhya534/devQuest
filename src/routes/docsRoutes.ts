import express from "express";
import docsController from "../controller/docsController.js";
import asyncHandler from "../middleware/asyncHandler.js";

const router = express.Router();

router.get("/openapi.json", asyncHandler(docsController.openapi));
router.get("/docs", asyncHandler(docsController.ui));

export default router;
