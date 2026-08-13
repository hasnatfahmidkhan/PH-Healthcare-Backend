import type { NextFunction, Request, RequestHandler, Response } from "express";
import { ZodObject } from "zod";
import { catchAsync } from "../utils/catchAsync";

const validateRequest = (schema: ZodObject): RequestHandler => {
  return catchAsync(async (req: Request, res: Response, next: NextFunction) => {
    const payload = req.body;
    const result = schema.safeParse(payload);

    if (!result.success) {
      console.log(result.error);
      console.log(result.error.issues);
      //   throw new Error(result.error.issues[0].message);
      throw result.error;
    }

    req.body = result.data;

    next();
  });
};

export default validateRequest;
