import cron from "node-cron";
import { DoctorVeificationStatus, Role } from "../../generated/prisma/enums";
import { prisma } from "./prisma";

const deleteUnverifiedPendingDoctors = async () => {
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

  const result = await prisma.user.deleteMany({
    where: {
      emailVerified: false,
      role: Role.DOCTOR,
      createdAt: {
        lt: oneHourAgo,
      },

      doctors: {
        verificationStatus: DoctorVeificationStatus.PENDING,
        isDeleted: false,
      },
    },
  });

  if (result.count > 0) {
    console.log(`[CRON] Deleted ${result.count} unverified pending doctor(s).`);
  }

  return result;
};

const deleteExpiredRejectedDoctors = async () => {
  const oneMonthAgo = new Date();

  oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);

  const result = await prisma.user.deleteMany({
    where: {
      verificationStatus: DoctorVeificationStatus.REJECTED,
      isDeleted: false,
      rejectedAt: {
        lt: oneMonthAgo,
      },
      doctors: {
        isDeleted: false,
      },
    },
  });

  if (result.count > 0) {
    console.log(
      `[CRON] Deleted ${result.count} rejected doctor application(s).`,
    );
  }

  return result;
};

const startCleanupCron = () => {
  // Runs once every 24 hours
  cron.schedule("0 0 * * *", async () => {
    try {
      console.log("[CRON] Starting doctor cleanup...");

      await deleteUnverifiedPendingDoctors();
      await deleteExpiredRejectedDoctors();

      console.log("[CRON] Doctor cleanup completed.");
    } catch (error) {
      console.error("[CRON] Doctor cleanup failed:", error);
    }
  });
};

export default startCleanupCron;
