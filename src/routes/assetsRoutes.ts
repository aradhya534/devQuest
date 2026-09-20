import express from "express";
import assetsController from "../controller/assetsController.js";

const router = express.Router();

router.get("/", assetsController.list);
router.post("/validate", assetsController.validate);

export default router;
