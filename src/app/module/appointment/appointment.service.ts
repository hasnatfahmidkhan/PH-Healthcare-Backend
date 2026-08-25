import {
  AppointmentStatus,
  PaymentStatus,
} from "../../../generated/prisma/enums";
import config from "../../config";
import { getBkashIdToken } from "../../lib/bkash";
import { prisma } from "../../lib/prisma";
import { IRequestUser } from "../auth/auth.interface";

class AppointmentService {
  payAppointment = async (payload: any, user: IRequestUser) => {
    const appointmentId = payload.appointmentId;
    const existingAppointment = await prisma.appoointment.findUnique({
      where: {
        id: appointmentId,
      },
    });

    if (!existingAppointment) {
      throw new Error("Appointment is not exists!");
    }

    if (existingAppointment.status !== "PENDING") {
      throw new Error("Appointment is not Pending");
    }

    const bkashIdToken = await getBkashIdToken();

    if (!bkashIdToken) {
      throw new Error("Faild to get bkash id token");
    }

    const bkashCreatePaymentResponse = await fetch(
      `${config.bkash_base_url}/tokenized/checkout/create`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          Authorization: bkashIdToken,
          "X-App-Key": config.bkash_app_key,
        },
        body: JSON.stringify({
          mode: "0011",
          // payerReference: "01770618575",
          payerReference: user.email,
          callbackURL: `${config.backend_url}/api/v1/appointment/book-appointment/payment/callback`,
          amount: "1200",
          currency: "BDT",
          intent: "sale",
          merchantInvoiceNumber: existingAppointment.id,
        }),
      },
    );

    const bkashCreatePaymentResult = await bkashCreatePaymentResponse.json();

    await prisma.payment.update({
      where: {
        appointmentId,
      },
      data: {
        bkashPaymentId: bkashCreatePaymentResult.paymentID,
        gatewayResponse: bkashCreatePaymentResult,
        merchantInvoiceNumber: bkashCreatePaymentResult.merchantInvoiceNumber,
      },
    });

    return { paymentUrl: bkashCreatePaymentResult.bkashURL };
  };

  bookAppointment = async (payload: any, user: IRequestUser) => {
    const transactionResult = await prisma.$transaction(async (tx) => {
      // create appointment
      const appointment = await tx.appoointment.create({
        data: {
          status: AppointmentStatus.PENDING,
        },
      });

      const bkashIdToken = await getBkashIdToken();

      if (!bkashIdToken) {
        throw new Error("Faild to get bkash id token");
      }

      const bkashCreatePaymentResponse = await fetch(
        `${config.bkash_base_url}/tokenized/checkout/create`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
            Authorization: bkashIdToken,
            "X-App-Key": config.bkash_app_key,
          },
          body: JSON.stringify({
            mode: "0011",
            // payerReference: "01770618575",
            payerReference: user.email,
            callbackURL: `${config.backend_url}/api/v1/appointment/book-appointment/payment/callback`,
            amount: "1200",
            currency: "BDT",
            intent: "sale",
            merchantInvoiceNumber: appointment.id,
          }),
        },
      );

      const bkashCreatePaymentResult = await bkashCreatePaymentResponse.json();

      // create payment
      await tx.payment.create({
        data: {
          amount: 1200,
          merchantInvoiceNumber: bkashCreatePaymentResult.merchantInvoiceNumber,
          appointmentId: appointment.id,
          gatewayResponse: bkashCreatePaymentResult,
          bkashPaymentId: bkashCreatePaymentResult.paymentID,
          payerReference: user.email,
        },
      });
      return { paymentUrl: bkashCreatePaymentResult.bkashURL };
    });
    return transactionResult;
  };

  bookAppointmentCallback = async (query: Record<string, any>) => {
    const transactionResult = await prisma.$transaction(async (tx) => {
      const paymentID = query.paymentID;
      const paymentStatus = query.status;

      if (!paymentID) {
        throw new Error("Payment ID missing");
      }

      if (!paymentStatus) {
        throw new Error("Payment is faild");
      }

      const bkashIdToken = await getBkashIdToken();

      if (!bkashIdToken) {
        throw new Error("Faild to get bkash id token");
      }

      const bkashPaymentExecuteResponse = await fetch(
        `${config.bkash_base_url}/tokenized/checkout/execute`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
            Authorization: bkashIdToken,
            "X-App-Key": config.bkash_app_key,
          },
          body: JSON.stringify({
            paymentID: paymentID,
          }),
        },
      );

      const bkashPaymentExecuteResult =
        await bkashPaymentExecuteResponse.json();

      if (paymentStatus === "success") {
        await tx.appoointment.update({
          where: {
            id: bkashPaymentExecuteResult.merchantInvoiceNumber,
          },
          data: {
            status: AppointmentStatus.BOOKED,
          },
        });

        await tx.payment.update({
          where: {
            bkashPaymentId: paymentID,
            appointmentId: bkashPaymentExecuteResult.merchantInvoiceNumber,
          },
          data: {
            status: PaymentStatus.PAID,
            bkashTrxId: bkashPaymentExecuteResult.trxID,
            paidAt: bkashPaymentExecuteResult.paymentExecuteTime,
            gatewayResponse: bkashPaymentExecuteResult,
          },
        });

        return {
          redirectUrl: `${config.frontend_url}/dashboard/my-appointments?status=success`,
        };
      } else if (paymentStatus === "failure") {
        await tx.payment.update({
          where: {
            bkashPaymentId: paymentID,
          },
          data: {
            status: PaymentStatus.FAILED,
            gatewayResponse: bkashPaymentExecuteResult,
          },
        });

        return {
          redirectUrl: `${config.frontend_url}/dashboard/my-appointments?status=failure`,
        };
      } else if (paymentStatus === "cancel") {
        await tx.payment.update({
          where: {
            bkashPaymentId: paymentID,
          },
          data: {
            status: PaymentStatus.CANCELLED,
            gatewayResponse: bkashPaymentExecuteResult,
          },
        });

        return {
          redirectUrl: `${config.frontend_url}/dashboard/my-appointments?status=cancel`,
        };
      } else {
        return {
          redirectUrl: `${config.frontend_url}/dashboard/my-appointments?error=payment-failed`,
        };
      }
    });
    return transactionResult;
  };

  cancelAppointment = async (payload: any, user: IRequestUser) => {
    const transactionResult = await prisma.$transaction(async (tx) => {
      const appointmentId = payload.appointmentId;

      const existingAppointment = await tx.appoointment.findUnique({
        where: {
          id: appointmentId,
        },
        include: {
          payment: true,
        },
      });

      if (!existingAppointment) {
        throw new Error("Appointment is not exists");
      }

      if (
        existingAppointment.status === "ONGOING" ||
        existingAppointment.status === "COMPLETED"
      ) {
        throw new Error("Appointment is ongoing or completed");
      }

      if (existingAppointment.status === "CANCELLED") {
        throw new Error("Appointment is already cancelled");
      }

      const updatedAppointment = await tx.appoointment.update({
        where: {
          id: appointmentId,
        },
        data: {
          status: AppointmentStatus.CANCELLED,
        },
      });

      const bkashIdToken = await getBkashIdToken();

      if (!bkashIdToken) {
        throw new Error("Faild to get bkash id token");
      }

      const bkashRefundResponse = await fetch(
        `${config.bkash_base_url}/tokenized/checkout/payment/refund`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
            Authorization: bkashIdToken,
            "X-App-Key": config.bkash_app_key,
          },
          body: JSON.stringify({
            paymentID: existingAppointment.payment?.bkashPaymentId,
            trxID: existingAppointment.payment?.bkashTrxId,
            amount: existingAppointment.payment?.amount.toString(),
            sku: "Appointment Cancellation",
            reason: payload.reason || "Patient cancelled the appointment",
          }),
        },
      );

      const bkashRefundResult = await bkashRefundResponse.json();

      const updatedPayment = await tx.payment.update({
        where: {
          appointmentId: updatedAppointment.id,
        },
        data: {
          refundAmmount: bkashRefundResult.amount,
          refundTrxId: bkashRefundResult.refundTrxID,
          refundAt: bkashRefundResult.completedTime,
          refundReason: payload.reason || "Patient cancelled the appointment",
          status: PaymentStatus.REFUNDED,
          gatewayResponse: bkashRefundResult,
        },
      });

      return {
        appointment: updatedAppointment,
        payment: updatedPayment,
      };
    });
    return transactionResult;
  };
}

export const appointmentService = new AppointmentService();
