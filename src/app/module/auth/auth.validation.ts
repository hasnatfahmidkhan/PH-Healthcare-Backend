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

export const UserValidation = { PatientRegisterSchema, LoginSchema };
