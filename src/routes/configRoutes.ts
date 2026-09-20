import express from "express";
import configController from "../controller/configController.js";
import asyncHandler from "../middleware/asyncHandler.js";

const router = express.Router();

router.get("/:key", asyncHandler(configController.getConfig));
router.put("/:key", asyncHandler(configController.putConfig));

export default router;
