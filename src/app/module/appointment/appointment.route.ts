import { Router } from "express";
import { Role } from "../../../generated/prisma/enums";
import { auth } from "../../middleware/checkAuth";
import { appointmentController } from "./appointment.controller";

const router = Router();

router.post(
  "/pay-appointment",
  auth(Role.PATIENT),
  appointmentController.payAppointment,
);

router.post(
  "/book-appointment",
  auth(Role.PATIENT),
  appointmentController.bookAppointment,
);

// bkash callback api
router.get(
  "/book-appointment/payment/callback",
  appointmentController.bookAppointmentCallback,
);

export const appointmentRoutes = router;
