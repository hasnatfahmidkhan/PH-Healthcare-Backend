import { UploadApiResponse } from "cloudinary";
import httpStatus from "http-status";
import { cloudinary } from "../../lib/cloudinary";
import { prisma } from "../../lib/prisma";
import AppError from "../../utils/AppError";

const updateProfilePhoto = async (buffer: Buffer, userId: string) => {
  const currentUser = await prisma.user.findUnique({
    where: {
      id: userId,
    },
    select: {
      imagePublicId: true,
      imageUrl: true,
    },
  });

  const uploadResult = await new Promise<UploadApiResponse>(
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

      uploadStream.end(buffer);
    },
  );

  const imagePublicId = uploadResult.public_id;
  const imageUrl = uploadResult.secure_url;

  const updateUser = await prisma.user.update({
    where: {
      id: userId,
    },
    data: {
      imagePublicId,
      imageUrl,
    },
    select: {
      imagePublicId: true,
      imageUrl: true,
    },
  });

  if (currentUser?.imagePublicId && currentUser.imageUrl) {
    await cloudinary.uploader.destroy(currentUser.imagePublicId);
  }

  return updateUser;
};

export const userService = {
  updateProfilePhoto,
};
