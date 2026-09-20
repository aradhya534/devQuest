import express from "express";
import type { Request, Response } from "express";

const router = express.Router();

router.post("/echo", (req: Request, res: Response) => {
  res.status(200).json({ data: req.body ?? {}, meta: {} });
});

export default router;
