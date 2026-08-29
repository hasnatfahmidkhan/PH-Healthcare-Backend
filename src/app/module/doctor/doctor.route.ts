import { Router } from "express";
import { Role } from "../../../generated/prisma/enums";
import { upload } from "../../lib/multer";
import { auth } from "../../middleware/checkAuth";
import validateRequest from "../../middleware/validateRequest";
import { UserValidation } from "../auth/auth.validation";
import { doctorController } from "./doctor.controller";
import { DoctorVerifySchema } from "./doctor.validation";

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

router.patch(
  "/approve-doctor",
  auth(Role.ADMIN, Role.SUPER_ADMIN),
  validateRequest(DoctorVerifySchema),
  doctorController.approveDoctor,
);

router.get(
  "/all-doctors",
  auth(Role.ADMIN, Role.SUPER_ADMIN),
  doctorController.getAllDoctors,
);

export const doctorRoutes = router;
