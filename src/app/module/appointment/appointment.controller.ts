import type { NextFunction, Request, Response } from "express";
import httpStatus from "http-status";
import { catchAsync } from "../../utils/catchAsync";
import { sendResponse } from "../../utils/sendResponse";
import { appointmentService } from "./appointment.service";

class AppointmentController {
  payAppointment = catchAsync(
    async (req: Request, res: Response, next: NextFunction) => {
      const payload = req.body;
      const user = req.user!;
      const result = await appointmentService.payAppointment(payload, user);

      sendResponse(res, {
        success: true,
        statusCode: httpStatus.OK,
        message: "Payment Initiated successfully",
        data: result,
      });
    },
  );

  bookAppointment = catchAsync(
    async (req: Request, res: Response, next: NextFunction) => {
      const payload = req.body;
      const user = req.user!;
      const result = await appointmentService.bookAppointment(payload, user);

      sendResponse(res, {
        success: true,
        statusCode: httpStatus.OK,
        message: "Payment Created",
        data: result,
      });
    },
  );

  bookAppointmentCallback = catchAsync(
    async (req: Request, res: Response, next: NextFunction) => {
      const { redirectUrl } = await appointmentService.bookAppointmentCallback(
        req.query,
      );

      res.redirect(redirectUrl);

      //   sendResponse(res, {
      //     success: true,
      //     statusCode: httpStatus.OK,
      //     message: "Booking Successfull",
      //     data: result,
      //   });
    },
  );
}

export const appointmentController = new AppointmentController();
