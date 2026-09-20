import type { Request, Response, NextFunction } from "express";
import HttpStatus from "../enums/httpStatus.js";

export default function error(req: Request & { length?: number }, res: Response, _next: NextFunction): void {
  if (req.length === 0) {
    res.status(HttpStatus.NOT_FOUND).send("Not found");
  } else {
    res.status(HttpStatus.INTERNAL_SERVER_ERROR).send("Something went wrong!");
  }
}
