import bcrypt from "bcryptjs";
import { UploadApiResponse } from "cloudinary";
import crypto from "crypto";
import ejs from "ejs";
import path from "path";
import { Role, UserStatus } from "../../../generated/prisma/enums";
import config from "../../config";
import { cloudinary } from "../../lib/cloudinary";
import { transporter } from "../../lib/nodemailer";
import { prisma } from "../../lib/prisma";
import { redisClient } from "../../lib/redis";
import {
  DoctorApplicationInput,
  IVerifyDoctorEmailPayload,
} from "./doctor.interface";

class DoctorService {
  verifyDoctorEmail = async (payload: IVerifyDoctorEmailPayload) => {
    const email = payload.email.trim().toLowerCase();

    const user = await prisma.user.findUnique({
      where: { email, role: Role.DOCTOR },
    });

    if (!user) {
      throw new Error("Doctor Application not found. please apply again.");
    }

    if (user.emailVerified) {
      throw new Error("Email already verified");
    }

    if (user.status === UserStatus.BLOCKED) {
      throw new Error("User is blocked");
    }

    if (user.isDeleted || user.status === UserStatus.DELETED) {
      throw new Error("User is deleted");
    }

    const otp = payload.otp;
    const otpKey = `doctor-application-otp:${email}`;
    const storedOtp = await redisClient.get(otpKey);

    if (!storedOtp) {
      throw new Error(
        "OTP has expired. Your Application Window has closed, Please apply again.",
      );
    }

    if (storedOtp !== otp) {
      throw new Error("OTP Does not Match!");
    }
    await redisClient.del(otpKey);

    const verifiedUser = await prisma.user.update({
      where: { id: user.id },
      data: {
        emailVerified: true,
      },
      omit: { password: true },
      include: {
        doctors: true,
      },
    });
    return verifiedUser;
  };

  applyAsDoctor = async (
    payload: DoctorApplicationInput,
    resume: Express.Multer.File | null,
    addtionalFiles: Express.Multer.File[],
  ) => {
    const isUserExists = await prisma.user.findUnique({
      where: {
        email: payload.user.email,
      },
    });

    if (isUserExists) {
      throw new Error("User already exists with this email.");
    }

    const resumeUploadResult = await new Promise<UploadApiResponse>(
      (resolve, reject) => {
        const uploadStream = cloudinary.uploader.upload_stream(
          {
            resource_type: "auto",
            folder: "ph_healthcare_system",
          },
          (err, result) => {
            if (err) return reject(err);
            if (!result)
              return reject(new Error("Upload failed, no result received."));
            resolve(result);
          },
        );

        uploadStream.end(resume?.buffer);
      },
    );

    const resumePublicId = resumeUploadResult.public_id;
    const resumeUrl = resumeUploadResult.secure_url;

    const additionalFilesUploadResult = await Promise.all(
      addtionalFiles.map((file) => {
        return new Promise<UploadApiResponse>((resolve, reject) => {
          const uploadStream = cloudinary.uploader.upload_stream(
            {
              resource_type: "auto",
              folder: "ph_healthcare_system",
            },
            (err, result) => {
              if (err) return reject(err);
              if (!result)
                return reject(new Error("Upload failed, no result received."));
              resolve(result);
            },
          );

          uploadStream.end(file.buffer);
        });
      }),
    );

    const randomDoctorPassword = Math.random().toString(36).slice(-8);

    const hashPassword = await bcrypt.hash(
      randomDoctorPassword,
      Number(config.bcrypt_salt_rounds),
    );

    const doctorApplication = await prisma.user.create({
      data: {
        ...payload.user,
        password: hashPassword,
        role: Role.DOCTOR,
        needPasswordChange: true,
        status: UserStatus.PENDING,
        doctors: {
          create: {
            ...payload.doctor,
            name: payload.user.name,
            email: payload.user.email,
            resume: resumeUrl,
            resumePublicId,
            additionalFiles: additionalFilesUploadResult.map((file) => ({
              url: file.secure_url,
              publicId: file.public_id,
            })),
          },
        },
      },
      omit: {
        password: false,
      },
      include: {
        doctors: true,
      },
    });

    const otpKey = `doctor-application-otp:${payload.user.email}`;
    const verifyOTP = crypto.randomInt(100000, 1000000).toString();

    await redisClient.set(otpKey, verifyOTP, {
      expiration: {
        type: "EX",
        value: 60 * 60,
      },
    });

    const html = await ejs.renderFile(
      path.join(process.cwd(), "/src/app/templates/verifyEmailOtp.ejs"),
      {
        name: payload.user.name,
        otp: verifyOTP,
        expiryMinutes: 60 * 60,
        appName: config.app_name,
        supportEmail: config.email_sender,
        year: new Date().getFullYear(),
      },
    );

    await transporter.sendMail({
      from: `"${config.app_name}" <${config.email_sender}>`,
      to: payload.user.email,
      subject: "Verify your email address",
      html,
    });

    return doctorApplication;
  };
}

export const doctorService = new DoctorService();
