import { Router } from "express";
import { upload } from "../../lib/multer";
import validateRequest from "../../middleware/validateRequest";
import { UserValidation } from "../auth/auth.validation";
import { doctorController } from "./doctor.controller";

const router = Router();

router.post(
  "/apply-as-doctor/verify-email",
  validateRequest(UserValidation.EmailVerifySchema),
  doctorController.verifyDoctorEmail,
);

router.post(
  "/apply-as-doctor",
  upload.fields([
    {
      name: "resume",
      maxCount: 1,
    },
    {
      name: "additionalFiles",
      maxCount: 10,
    },
  ]),
  doctorController.applyAsDoctor,
);

export const doctorRoutes = router;
