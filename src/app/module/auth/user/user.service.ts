import { UploadApiResponse } from "cloudinary";
import { cloudinary } from "../../../lib/cloudinary";
import { prisma } from "../../../lib/prisma";

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
            return reject(new Error("Upload failed, no result received."));
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
