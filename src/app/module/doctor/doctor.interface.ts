import z from "zod";
import {
  DoctorApplicationSchema,
  DoctorVerifySchema,
} from "./doctor.validation";

export type DoctorApplicationInput = z.infer<typeof DoctorApplicationSchema>;
export interface IVerifyDoctorEmailPayload {
  email: string;
  otp: string;
}

export type DoctorVerifyPayload = z.infer<typeof DoctorVerifySchema>;
