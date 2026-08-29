import z from "zod";
import { DoctorApplicationSchema } from "./doctor.validation";

export type DoctorApplicationInput = z.infer<typeof DoctorApplicationSchema>;
export interface IVerifyDoctorEmailPayload {
  email: string;
  otp: string;
}
