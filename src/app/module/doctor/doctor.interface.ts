import z from "zod";
import {
  DoctorApplicationSchema,
  
  DoctorQuerySchema,
  
  DoctorVerifySchema,
} from "./doctor.validation";

export type DoctorApplicationInput = z.infer<typeof DoctorApplicationSchema>;
export interface IVerifyDoctorEmailPayload {
  email: string;
  otp: string;
}

export type DoctorVerifyPayload = z.infer<typeof DoctorVerifySchema>;

export type DoctorQueryPayload = z.infer<typeof DoctorQuerySchema>;
