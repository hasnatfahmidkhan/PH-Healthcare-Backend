import bcrypt from "bcryptjs";
import { UploadApiResponse } from "cloudinary";
import crypto from "crypto";
import ejs from "ejs";
import httpStatus from "http-status";
import path from "path";
import { Prisma } from "../../../generated/prisma/client";
import {
  DoctorVeificationStatus,
  Role,
  UserStatus,
} from "../../../generated/prisma/enums";
import config from "../../config";
import { cloudinary } from "../../lib/cloudinary";
import { transporter } from "../../lib/nodemailer";
import { prisma } from "../../lib/prisma";
import { redisClient } from "../../lib/redis";
import { IRequestUser } from "../../middleware/checkAuth";
import AppError from "../../utils/AppError";
import {
  DoctorApplicationInput,
  DoctorQueryPayload,
  DoctorVerifyPayload,
  IVerifyDoctorEmailPayload,
} from "./doctor.interface";

class DoctorService {
  verifyDoctorEmail = async (payload: IVerifyDoctorEmailPayload) => {
    const email = payload.email.trim().toLowerCase();

    const user = await prisma.user.findUnique({
      where: { email, role: Role.DOCTOR },
    });

    if (!user) {
      throw new AppError(
        httpStatus.NOT_FOUND,
        "Doctor Application not found. please apply again.",
      );
    }

    if (user.emailVerified) {
      throw new AppError(httpStatus.BAD_REQUEST, "Email already verified");
    }

    if (user.status === UserStatus.BLOCKED) {
      throw new AppError(httpStatus.FORBIDDEN, "User is blocked");
    }

    if (user.isDeleted || user.status === UserStatus.DELETED) {
      throw new AppError(httpStatus.BAD_REQUEST, "User is deleted");
    }

    const otp = payload.otp;
    const otpKey = `doctor-application-otp:${email}`;
    const storedOtp = await redisClient.get(otpKey);

    if (!storedOtp) {
      throw new AppError(
        httpStatus.BAD_REQUEST,
        "OTP has expired. Your Application Window has closed, Please apply again.",
      );
    }

    if (storedOtp !== otp) {
      throw new AppError(httpStatus.BAD_REQUEST, "OTP Does not Match!");
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
      throw new AppError(
        httpStatus.CONFLICT,
        "User already exists with this email.",
      );
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
              return reject(
                new AppError(
                  httpStatus.INTERNAL_SERVER_ERROR,
                  "Upload failed, no result received.",
                ),
              );
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
                return reject(
                  new AppError(
                    httpStatus.INTERNAL_SERVER_ERROR,
                    "Upload failed, no result received.",
                  ),
                );
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

  approveDoctor = async (
    payload: DoctorVerifyPayload,
    reviewer: IRequestUser,
  ) => {
    const { doctorId, verificationStatus, rejectedReason } = payload;

    const doctor = await prisma.doctor.findUnique({
      where: {
        id: doctorId,
      },
      include: {
        user: true,
      },
    });

    if (!doctor) {
      throw new AppError(httpStatus.NOT_FOUND, "Doctor Applicaton not found!");
    }

    if (doctor.isDeleted) {
      throw new AppError(
        httpStatus.BAD_REQUEST,
        "Doctor Applicaton has been deleted!",
      );
    }

    if (!doctor.user.emailVerified) {
      throw new AppError(
        httpStatus.BAD_REQUEST,
        "Doctor Has not Verified Their Email Yet. Application can not be Reviewed!",
      );
    }

    if (doctor.verificationStatus !== DoctorVeificationStatus.PENDING) {
      throw new AppError(
        httpStatus.BAD_REQUEST,
        `Doctor Application Has already Been ${doctor.verificationStatus.toLocaleLowerCase()}`,
      );
    }

    if (
      verificationStatus === DoctorVeificationStatus.REJECTED &&
      !doctor.rejectionReason
    ) {
      throw new AppError(
        httpStatus.BAD_REQUEST,
        "Rejection Reason Is Required When Rejecting A Doctor Applicaion.",
      );
    }

    const updatedDoctor = await prisma.doctor.update({
      where: { id: doctorId },
      data: {
        verificationStatus,
        rejectionReason:
          verificationStatus === DoctorVeificationStatus.REJECTED
            ? rejectedReason
            : null,
        reviewedAt: new Date(),
        reviewedBy: reviewer.userId,
      },
    });

    const html = await ejs.renderFile(
      path.join(
        process.cwd(),
        "/src/app/templates/doctorApplicatoionReviewed.ejs",
      ),
      {
        appName: config.app_name,
        name: doctor.name,
        status: verificationStatus,
        reviewedBy: reviewer.name,
        rejectedReason: payload.rejectedReason,
        ctaUrl: `${config.frontend_url}/doctor/application`,
        ctaText: "View Application",
        supportEmail: config.email_sender,
        year: new Date().getFullYear(),
      },
    );

    await transporter.sendMail({
      from: `"${config.app_name}" <${config.email_sender}>`,
      to: doctor.email,
      subject:
        verificationStatus === "APPROVED"
          ? "Your Doctor Application Has Been Approved"
          : "Update on Your Doctor Application",
      html,
    });
  };

  getAllDoctors = async (query: DoctorQueryPayload) => {
    const { searchTerm, verificationStatus, page, limit, sortBy, sortOrder } =
      query;

    // Pagination
    const pageNumber = Number(page);
    const limitNumber = Number(limit);
    const skip = (pageNumber - 1) * limitNumber;

    // Build where condition
    const whereConditions: Prisma.doctorWhereInput = {
      isDeleted: false,
    };

    // Search
    if (searchTerm) {
      whereConditions.OR = [
        {
          name: {
            contains: searchTerm,
            mode: "insensitive",
          },
        },
        {
          email: {
            contains: searchTerm,
            mode: "insensitive",
          },
        },
        {
          specialization: {
            contains: searchTerm,
            mode: "insensitive",
          },
        },
        {
          licenseNumber: {
            contains: searchTerm,
            mode: "insensitive",
          },
        },
      ];
    }

    // Verification status filter
    if (verificationStatus) {
      whereConditions.verificationStatus = verificationStatus;
    }

    // Get doctors + total count concurrently
    const [allDoctors, totalDoctors] = await prisma.$transaction([
      prisma.doctor.findMany({
        where: whereConditions,

        skip,
        take: limitNumber,

        orderBy: {
          [sortBy]: sortOrder,
        },

        select: {
          id: true,
          name: true,
          email: true,
          address: true,
          contactNumber: true,
          specialization: true,
          licenseNumber: true,
          qualifications: true,
          experienceYears: true,
          bio: true,
          conultationFee: true,
          verificationStatus: true,
          rejectionReason: true,
          reviewedBy: true,
          reviewedAt: true,
          resume: true,
          additionalFiles: true,
          isDeleted: true,
          createdAt: true,
          updatedAt: true,

          user: {
            select: {
              id: true,
              email: true,
              role: true,
              status: true,
            },
          },
        },
      }),

      prisma.doctor.count({
        where: whereConditions,
      }),
    ]);

    // Calculate pagination metadata
    const totalPages = Math.ceil(totalDoctors / limitNumber);

    return {
      meta: {
        page: pageNumber,
        limit: limitNumber,
        total: totalDoctors,
        totalPages,
      },
      data: allDoctors,
    };
  };
}

export const doctorService = new DoctorService();
