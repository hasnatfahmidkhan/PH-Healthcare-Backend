import z from "zod";
import type { Role } from "../../../generated/prisma/browser";
import { UserValidation } from "./auth.validation";

export interface ILoginUserPayload {
  email: string;
  password: string;
}

export interface IRegisterPatientPayload {
  name: string;
  email: string;
  password: string;
  patient?: {
    contactNumber?: string;
  };
}

export interface IVerifyEmailPayload {
  email: string;
  otp: string;
}

export interface IRequestUser {
  userId: string;
  email: string;
  name: string;
  role: Role;
}

export interface IGoogleLoginPayload {
  idToken: string;
}

export type TForgotPasswordPayload = z.infer<
  typeof UserValidation.ForgotPasswordSchema
>;

export type TResetPasswordPayload = z.infer<
  typeof UserValidation.ResetPasswordSchema
>;
