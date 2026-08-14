import z from "zod";

const PatientRegisterSchema = z.object({
  name: z
    .string({ error: "Name is Required" })
    .min(3, { error: "Name must be minimum 3 characters" })
    .max(50, { error: "Name must be minimum 50 characters" }),
  email: z.email({ error: "Email is Required" }),
  password: z
    .string({ error: "password is required" })
    .min(8, "Password must be at least 8 characters long")
    .max(64, "Password cannot exceed 64 characters")
    .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
    .regex(/[a-z]/, "Password must contain at least one lowercase letter")
    .regex(/[0-9]/, "Password must contain at least one number")
    .regex(
      /[^A-Za-z0-9]/,
      "Password must contain at least one special character",
    ),
  patient: z
    .object({
      contactNumber: z.string().optional(),
    })
    .optional(),
});

const EmailVerifySchema = z.object({
  email: z.email({ error: "Email is Required" }),
  otp: z.string().length(6),
});

const LoginSchema = z.object({
  email: z.email({ error: "Email is Required" }),
  password: z
    .string({ error: "password is required" })
    .min(8, "Password must be at least 8 characters long")
    .max(64, "Password cannot exceed 64 characters")
    .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
    .regex(/[a-z]/, "Password must contain at least one lowercase letter")
    .regex(/[0-9]/, "Password must contain at least one number")
    .regex(
      /[^A-Za-z0-9]/,
      "Password must contain at least one special character",
    ),
});

const ForgotPasswordSchema = z.object({
  email: z.email({ error: "Email is Required" }),
});

const ResetPasswordSchema = z.object({
  email: z.email({ error: "Email is Required" }),
  newPassword: z
    .string({ error: "password is required" })
    .min(8, "Password must be at least 8 characters long")
    .max(64, "Password cannot exceed 64 characters")
    .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
    .regex(/[a-z]/, "Password must contain at least one lowercase letter")
    .regex(/[0-9]/, "Password must contain at least one number")
    .regex(
      /[^A-Za-z0-9]/,
      "Password must contain at least one special character",
    ),
  otp: z.string().length(6),
});

export const UserValidation = {
  PatientRegisterSchema,
  LoginSchema,
  ForgotPasswordSchema,
  ResetPasswordSchema,
  EmailVerifySchema
};
