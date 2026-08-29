import * as z from "zod";
import { DoctorVeificationStatus } from "../../../generated/prisma/enums";

export const UserBaseSchema = z.object({
  name: z
    .string({ error: "Name is required" })
    .min(2, "Name must be at least 2 characters long"),
  email: z.email("Invalid email address format"),
});

export const DoctorBaseSchema = z.object({
  address: z
    .string()
    .min(5, "Address must be at least 5 characters")
    .nullable()
    .optional(),
  contactNumber: z
    .string()
    .regex(/^\+?[1-9]\d{1,14}$/, "Invalid international phone number")
    .nullable()
    .optional(),
  specialization: z
    .string({ error: "Specialization is required" })
    .min(2, "Specialization is required"),
  licenseNumber: z
    .string({ error: "License number  is required" })
    .min(3, "Valid medical license number is required"),
  qualifications: z
    .string({ error: "Qualifications is required" })
    .min(2, "Academic qualifications are required"),
  experienceYears: z
    .number()
    .int()
    .nonnegative("Experience years must be a positive integer"),
  bio: z
    .string()
    .max(1000, "Bio cannot exceed 1000 characters")
    .nullable()
    .optional(),
  conultationFee: z.coerce
    .number()
    .positive("Fee must be a positive amount")
    .nullable()
    .optional(),
});

export const DoctorApplicationSchema = z.object({
  user: UserBaseSchema,
  doctor: DoctorBaseSchema,
});

export const DoctorVerifySchema = z
  .object({
    doctorId: z.uuid("Doctor ID is required."),
    verificationStatus: z.enum([
      DoctorVeificationStatus.APPROVED,
      DoctorVeificationStatus.REJECTED,
    ]),
    rejectedReason: z.string().optional(),
  })
  .refine(
    (data) => {
      if (data.verificationStatus === DoctorVeificationStatus.REJECTED) {
        return !!data.rejectedReason && data.rejectedReason.trim().length > 0;
      }
      return true;
    },
    {
      message: "Rejection reason is required when the application is rejected.",
      path: ["rejectedReason"],
    },
  );

export const QuerySchema = z.object({
  searchTerm: z.string().trim().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(10),
  sortBy: z
    .enum(["name", "createdAt", "experienceYears", "consultationFee"])
    .default("createdAt"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
});

export const DoctorQuerySchema = QuerySchema.extend({
  verificationStatus: z.enum(["PENDING", "APPROVED", "REJECTED"]).optional(),
});
