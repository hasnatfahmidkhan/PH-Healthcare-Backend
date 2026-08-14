import { Router } from "express";
import { Role } from "../../../generated/prisma/enums";
import { auth } from "../../middleware/checkAuth";
import validateRequest from "../../middleware/validateRequest";
import { AuthController } from "./auth.controller";
import { UserValidation } from "./auth.validation";

const router = Router();

// Register Patient
router.post(
  "/register",
  validateRequest(UserValidation.PatientRegisterSchema),
  AuthController.registerPatient,
);

// Verify Email
router.post(
  "/verify-email",
  validateRequest(UserValidation.EmailVerifySchema),
  AuthController.verifyEmail,
);

// Login USER
router.post(
  "/login",
  validateRequest(UserValidation.LoginSchema),
  AuthController.loginUser,
);

// Get ME
router.get(
  "/me",
  auth(Role.ADMIN, Role.DOCTOR, Role.PATIENT, Role.SUPER_ADMIN),
  AuthController.getMe,
);

// Refresh Token
router.post("/refresh-token", AuthController.refreshToken);

// Google Login
router.post("/google", AuthController.googleLogin);

// Forget Password
router.post(
  "/forgot-password",
  validateRequest(UserValidation.ForgotPasswordSchema),
  AuthController.forgotPassword,
);

// Reset Password
router.post(
  "/reset-password",
  validateRequest(UserValidation.ResetPasswordSchema),
  AuthController.resetPassword,
);

export const AuthRoutes = router;
