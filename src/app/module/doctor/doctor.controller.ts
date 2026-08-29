import { NextFunction, Request, Response } from "express";
import httpStatus from "http-status";
import { catchAsync } from "../../utils/catchAsync";
import { sendResponse } from "../../utils/sendResponse";
import { doctorService } from "./doctor.service";
import { DoctorApplicationSchema } from "./doctor.validation";

class DoctorController {
  verifyDoctorEmail = catchAsync(
    async (req: Request, res: Response, next: NextFunction) => {
      const result = await doctorService.verifyDoctorEmail(req.body);

      sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: "Doctor Email Verify Successfully",
        data: result,
      });
    },
  );

  applyAsDoctor = catchAsync(
    async (req: Request, res: Response, next: NextFunction) => {
      const files = req.files as { [fieldname: string]: Express.Multer.File[] };
      const resume = files?.["resume"] ? files?.["resume"][0] : null;

      const additionalFiles = files?.["additionalFiles"]
        ? files?.["additionalFiles"]
        : [];

      const payload = DoctorApplicationSchema.safeParse(
        JSON.parse(req.body.data),
      );

      if (!payload.success) {
        const errorMessages = payload.error.issues
          .map((issue) => issue.message)
          .join(", ");

        throw new Error(errorMessages);
      }

      const result = await doctorService.applyAsDoctor(
        payload.data,
        resume,
        additionalFiles,
      );

      sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: "Apply as doctor successfully",
        data: result,
      });
    },
  );

  approveDoctor = catchAsync(
    async (req: Request, res: Response, next: NextFunction) => {
      const result = await doctorService.approveDoctor(req.body, req.user!);

      sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: "Approve Doctor Successfully.",
        data: result,
      });
    },
  );
}

export const doctorController = new DoctorController();
