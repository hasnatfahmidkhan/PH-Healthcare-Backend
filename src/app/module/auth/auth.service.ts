import bcrypt from "bcryptjs";
import crypto from "crypto";
import ejs from "ejs";
import type { TokenPayload } from "google-auth-library";
import type { JwtPayload, SignOptions } from "jsonwebtoken";
import path from "path";
import {
  AuthProvider,
  Role,
  UserStatus,
} from "../../../generated/prisma/enums";
import config from "../../config";
import googleClient from "../../lib/googleAuth";
import { transporter } from "../../lib/nodemailer";
import { prisma } from "../../lib/prisma";
import { redisClient } from "../../lib/redis";
import { jwtUtils } from "../../utils/jwt";
import type {
  IGoogleLoginPayload,
  ILoginUserPayload,
  IRegisterPatientPayload,
  IRequestUser,
  IVerifyEmailPayload,
  TForgotPasswordPayload,
  TResetPasswordPayload,
} from "./auth.interface";

const registerPatient = async (payload: IRegisterPatientPayload) => {
  const { name, password } = payload;
  const email = payload.email.trim().toLowerCase();

  const isUserExists = await prisma.user.findUnique({
    where: { email },
  });

  if (isUserExists) {
    throw new Error("User with this email already exists");
  }

  const hashedPassword = await bcrypt.hash(password, 8);

  const otpKey = `patient-registration-otp:${email}`;
  const verifyOTP = crypto.randomInt(100000, 1000000).toString();

  await redisClient.set(otpKey, verifyOTP, {
    expiration: {
      type: "EX",
      value: 5 * 60,
    },
  });

  const redisUserDataPayload = { ...payload, password: hashedPassword };
  const registraionKey = `patient-registration-data:${email}`;

  await redisClient.set(registraionKey, JSON.stringify(redisUserDataPayload), {
    expiration: {
      type: "EX",
      value: 5 * 60,
    },
  });

  const html = await ejs.renderFile(
    path.join(process.cwd(), "/src/app/templates/verifyEmailOtp.ejs"),
    {
      name: name,
      otp: verifyOTP,
      expiryMinutes: 5,
      appName: config.app_name,
      supportEmail: config.email_sender,
      year: new Date().getFullYear(),
    },
  );

  await transporter.sendMail({
    from: `"${config.app_name}" <${config.email_sender}>`,
    to: email,
    subject: "Verify your email address",
    html,
  });

  return null;
};

const verifyEmail = async (payload: IVerifyEmailPayload) => {
  const email = payload.email.trim().toLowerCase();

  const user = await prisma.user.findUnique({
    where: { email },
  });

  if (user?.emailVerified) {
    throw new Error("Email already verified");
  }

  if (user?.status === UserStatus.BLOCKED) {
    throw new Error("User is blocked");
  }

  if (user?.isDeleted || user?.status === UserStatus.DELETED) {
    throw new Error("User is deleted");
  }

  const otp = payload.otp;
  const otpKey = `patient-registration-otp:${email}`;
  const storedOtp = await redisClient.get(otpKey);

  if (!storedOtp) {
    throw new Error("OTP has expired or doesn't exist!");
  }

  if (storedOtp !== otp) {
    throw new Error("Invalid OTP!");
  }

  await redisClient.del(otpKey);

  const registraionKey = `patient-registration-data:${email}`;
  const redisPatientData = await redisClient.get(registraionKey);

  if (!redisPatientData) {
    throw new Error("User doesn't exists in redis!");
  }

  const patientPayload: IRegisterPatientPayload = JSON.parse(redisPatientData);

  const createdUser = await prisma.user.create({
    data: {
      name: patientPayload.name,
      email: patientPayload.email,
      password: patientPayload.password,
      role: Role.PATIENT,
      status: UserStatus.ACTIVE,
      emailVerified: true,
      patient: {
        create: {
          name: patientPayload.name,
          email: patientPayload.email,
          contactNumber: patientPayload.patient?.contactNumber ?? null,
        },
      },
    },
    omit: { password: true },
    include: { patient: true },
  });

  await redisClient.del(registraionKey);

  const { patient, ...userData } = createdUser;
  const jwtPayload = {
    userId: userData.id,
    name: userData.name,
    email: userData.email,
    role: userData.role,
  };

  const accessToken = jwtUtils.createToken(
    jwtPayload,
    config.jwt_access_secret,
    config.jwt_access_expires_in as SignOptions,
  );

  const refreshToken = jwtUtils.createToken(
    jwtPayload,
    config.jwt_refresh_secret,
    config.jwt_refresh_expires_in as SignOptions,
  );

  const html = await ejs.renderFile(
    path.join(process.cwd(), "/src/app/templates/welcomeEmail.ejs"),
    {
      name: userData.name,
      appName: config.app_name,
      ctaUrl: `${config.frontend_url}/dashboard`,
      ctaText: "Go to Dashboard",
      features: [
        "Book appointments with verified doctors in just a few clicks",
        "Keep track of your upcoming and past consultations",
        "Access your medical history and prescriptions in one place",
        "Get reminders before your scheduled appointments",
      ],
      supportEmail: "support@myapp.com",
      year: new Date().getFullYear(),
    },
  );

  await transporter.sendMail({
    from: `${config.app_name} <${config.email_sender}>`,
    to: userData.email,
    subject: `Welcome to ${config.app_name}!`,
    html,
  });

  return {
    userData,
    patient,
    accessToken,
    refreshToken,
  };
};

const loginUser = async (payload: ILoginUserPayload) => {
  const { password } = payload;
  const email = payload.email.trim().toLowerCase();

  const user = await prisma.user.findUnique({
    where: { email },
  });

  if (!user) {
    throw new Error("User not found");
  }

  if (user.status === UserStatus.BLOCKED) {
    throw new Error("User is blocked");
  }

  if (user.isDeleted || user.status === UserStatus.DELETED) {
    throw new Error("User is deleted");
  }

  if (user.password === null && user.googleId) {
    throw new Error(
      "User already has Register with google, try to login with login",
    );
  }

  const isPasswordMatched = await bcrypt.compare(
    password,
    user.password as string,
  );

  if (!isPasswordMatched) {
    throw new Error("Invalid credentials");
  }

  const jwtPayload = {
    userId: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
  };

  const accessToken = jwtUtils.createToken(
    jwtPayload,
    config.jwt_access_secret,
    config.jwt_access_expires_in as SignOptions,
  );

  const refreshToken = jwtUtils.createToken(
    jwtPayload,
    config.jwt_refresh_secret,
    config.jwt_refresh_expires_in as SignOptions,
  );

  return {
    accessToken,
    refreshToken,
  };
};

const getMe = async (user: IRequestUser) => {
  const isUserExists = await prisma.user.findUnique({
    where: {
      id: user.userId,
    },
    include: {
      patient: true,
    },
    omit: {
      password: true,
    },
  });

  if (!isUserExists) {
    throw new Error("User not found");
  }

  return isUserExists;
};

const refreshToken = async (token: string) => {
  const verifiedRefreshToken = jwtUtils.verifyToken(
    token,
    config.jwt_refresh_secret,
  );

  if (!verifiedRefreshToken.success || !verifiedRefreshToken.data) {
    throw new Error(
      config.node_env === "development"
        ? verifiedRefreshToken.error
        : "Invalid refresh token",
    );
  }

  const data = verifiedRefreshToken.data as JwtPayload;

  const user = await prisma.user.findUnique({
    where: { id: data.userId },
  });

  if (!user || user.isDeleted || user.status !== UserStatus.ACTIVE) {
    throw new Error("User is inactive or not found");
  }

  const jwtPayload = {
    userId: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
  };

  const accessToken = jwtUtils.createToken(
    jwtPayload,
    config.jwt_access_secret,
    config.jwt_access_expires_in as SignOptions,
  );

  const refreshToken = jwtUtils.createToken(
    jwtPayload,
    config.jwt_refresh_secret,
    config.jwt_refresh_expires_in as SignOptions,
  );

  return {
    accessToken,
    refreshToken,
  };
};

const googleLogin = async (payload: IGoogleLoginPayload) => {
  let googleIdTokenPayload: TokenPayload | undefined | null = null;

  try {
    const ticket = await googleClient.verifyIdToken({
      idToken: payload.idToken,
    });

    googleIdTokenPayload = ticket.getPayload();
  } catch (error) {
    console.log("Goolge Id token verification Failed!", error);
    throw new Error("Invalid Or Expired Google Id Token.");
  }

  if (!googleIdTokenPayload) {
    throw new Error("Invalid Or Expired Google Id Token.");
  }

  if (!googleIdTokenPayload.email) {
    throw new Error("Google Email is not found.");
  }

  if (!googleIdTokenPayload.name) {
    throw new Error("Google Name is not found.");
  }

  const isPatientExistsWithGoolgeAuth = await prisma.user.findUnique({
    where: {
      email: googleIdTokenPayload.email,
      role: Role.PATIENT,
      googleId: googleIdTokenPayload.sub,
    },
  });

  let user = isPatientExistsWithGoolgeAuth;

  if (!isPatientExistsWithGoolgeAuth) {
    const isPatientExistsWithCredential = await prisma.user.findUnique({
      where: {
        email: googleIdTokenPayload.email,
        role: Role.PATIENT,
        authProvider: AuthProvider.CREDENTIAL,
      },
    });

    if (isPatientExistsWithCredential) {
      if (isPatientExistsWithCredential.status === UserStatus.BLOCKED) {
        throw new Error("User is Blocked");
      }

      if (
        isPatientExistsWithCredential.isDeleted ||
        isPatientExistsWithCredential.status === UserStatus.DELETED
      ) {
        throw new Error("User is Deleted");
      }

      if (!isPatientExistsWithCredential.emailVerified) {
        throw new Error("User is not verified");
      }

      user = await prisma.user.update({
        where: {
          id: isPatientExistsWithCredential.id,
        },
        data: {
          googleId: googleIdTokenPayload.sub,
        },
      });
    } else {
      // google registration
      user = await prisma.user.create({
        data: {
          email: googleIdTokenPayload.email,
          name: googleIdTokenPayload.name,
          authProvider: AuthProvider.GOOGLE,
          emailVerified: true,
          googleId: googleIdTokenPayload.sub,
          role: Role.PATIENT,
          patient: {
            create: {
              email: googleIdTokenPayload.email,
              name: googleIdTokenPayload.name,
            },
          },
        },
      });

      const html = await ejs.renderFile(
        path.join(process.cwd(), "/src/app/templates/welcomeEmail.ejs"),
        {
          name: user.name,
          appName: config.app_name,
          ctaUrl: `${config.frontend_url}/dashboard`,
          ctaText: "Go to Dashboard",
          features: [
            "Book appointments with verified doctors in just a few clicks",
            "Keep track of your upcoming and past consultations",
            "Access your medical history and prescriptions in one place",
            "Get reminders before your scheduled appointments",
          ],
          supportEmail: "support@myapp.com",
          year: new Date().getFullYear(),
        },
      );

      await transporter.sendMail({
        from: `${config.app_name} <${config.email_sender}>`,
        to: user.email,
        subject: `Welcome to ${config.app_name}!`,
        html,
      });
    }
  }

  if (!user) {
    throw new Error("User is not Found");
  }

  if (user.status === UserStatus.BLOCKED) {
    throw new Error("User is Blocked");
  }

  if (user.isDeleted || user.status === UserStatus.DELETED) {
    throw new Error("User is Deleted");
  }

  const jwtPayload = {
    userId: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
  };

  const accessToken = jwtUtils.createToken(
    jwtPayload,
    config.jwt_access_secret,
    config.jwt_access_expires_in as SignOptions,
  );

  const refreshToken = jwtUtils.createToken(
    jwtPayload,
    config.jwt_refresh_secret,
    config.jwt_refresh_expires_in as SignOptions,
  );

  return {
    accessToken,
    refreshToken,
  };
};

const forgotPassword = async (payload: TForgotPasswordPayload) => {
  const user = await prisma.user.findUnique({
    where: {
      email: payload.email,
    },
  });

  if (!user) {
    throw new Error("User doesn't exist!");
  }

  if (!user.emailVerified) {
    throw new Error("Email isn't verified!");
  }

  if (user.status === UserStatus.BLOCKED) {
    throw new Error("User is blocked");
  }

  if (user.isDeleted) {
    throw new Error("User account has been deleted");
  }

  // Google user who has never set a password
  if (user.authProvider === AuthProvider.GOOGLE && !user.password) {
    throw new Error(
      "This account uses Google login. Please login with Google or set a password first.",
    );
  }

  const redisKey = `forgot-password-otp:${user.email}`;

  const existingOtp = await redisClient.get(redisKey);

  if (existingOtp) {
    const remainingSeconds = await redisClient.ttl(redisKey);

    const remainingMinutes = Math.ceil(remainingSeconds / 60);

    throw new Error(
      `An OTP has already been sent. Please try again after ${remainingMinutes} minute${
        remainingMinutes > 1 ? "s" : ""
      }.`,
    );
  }

  // Generate 6 digit OTP
  const otp = crypto.randomInt(100000, 1000000).toString();

  await redisClient.set(redisKey, otp, {
    expiration: {
      type: "EX",
      value: 5 * 60,
    },
  });

  const html = await ejs.renderFile(
    path.join(process.cwd(), "/src/app/templates/forgotPassword.ejs"),
    {
      name: user.name,
      otp,
      expiryMinutes: 5,
      appName: config.app_name,
      supportEmail: config.email_sender,
      year: new Date().getFullYear(),
    },
  );

  await transporter.sendMail({
    from: `"${config.app_name}" <${config.email_sender}>`,
    to: user.email,
    subject: "Password Reset OTP",
    text: `Your password reset OTP is ${otp}. This OTP will expire in 5 minutes.`,
    html,
  });
  return null;
};

const resetPassword = async (payload: TResetPasswordPayload) => {
  const { email, newPassword, otp } = payload;

  // 1. Find user
  const user = await prisma.user.findUnique({
    where: {
      email,
    },
  });

  if (!user) {
    throw new Error("User doesn't exist!");
  }

  // 2. Validate account
  if (user.isDeleted) {
    throw new Error("User account has been deleted");
  }

  if (user.status === UserStatus.BLOCKED) {
    throw new Error("User is blocked");
  }

  if (!user.emailVerified) {
    throw new Error("Email isn't verified!");
  }

  // 3. Get OTP from Redis
  const redisKey = `forgot-password-otp:${user.email}`;

  const storedOtp = await redisClient.get(redisKey);

  if (!storedOtp) {
    throw new Error("OTP has expired or doesn't exist!");
  }

  // 4. Verify OTP
  if (storedOtp !== otp) {
    throw new Error("Invalid OTP!");
  }

  // 5. Hash new password
  const hashedPassword = await bcrypt.hash(
    newPassword,
    Number(config.bcrypt_salt_rounds),
  );

  // 6. Update password
  await prisma.user.update({
    where: {
      id: user.id,
    },
    data: {
      password: hashedPassword,
      needPasswordChange: false,
    },
  });

  // 7. Delete OTP after successful reset
  await redisClient.del(redisKey);

  const html = await ejs.renderFile(
    path.join(process.cwd(), "/src/app/templates/passwordResetSuccess.ejs"),
    {
      name: user.name,
      email: user.email,
      changedAt: new Date().toLocaleString("en-US", {
        dateStyle: "medium",
        timeStyle: "short",
      }),
      loginUrl: `${config.frontend_url}/login`,
      supportUrl: `${config.frontend_url}/support`,
      supportEmail: config.email_sender,
      appName: config.app_name,
      year: new Date().getFullYear(),
    },
  );

  await transporter.sendMail({
    from: `"${config.app_name}" <${config.email_sender}>`,
    to: user.email,
    subject: "Password Reset Successful",
    text: "Your password has been reset successfully. If you did not make this change, please contact support immediately.",
    html,
  });
  return null;
};

export const AuthService = {
  registerPatient,
  loginUser,
  getMe,
  refreshToken,
  googleLogin,
  forgotPassword,
  resetPassword,
  verifyEmail,
};
