import { Request, Response } from "express";
import httpStatus from "http-status";
import { catchAsync } from "../../../utils/catchAsync";
import { sendResponse } from "../../../utils/sendResponse";
import { userService } from "./user.service";

const updateProfilePhoto = catchAsync(async (req: Request, res: Response) => {
  if (!req.file) {
    throw new Error("No file provided!");
  }

  if (req.file.size > 500 * 1024) {
    // 500 KB in bytes
    throw new Error("File size exceeds the limit of 500KB!");
  }

  const userId = req.user?.userId as string;

  const result = await userService.updateProfilePhoto(
    req.file?.buffer as Buffer,
    userId,
  );

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Profile Photo updated successfully!",
    data: result,
  });
});

export const userController = {
  updateProfilePhoto,
};
