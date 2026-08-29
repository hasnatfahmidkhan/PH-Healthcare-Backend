/*
  Warnings:

  - Changed the type of `additionalFiles` on the `doctor` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.

*/
-- AlterTable
ALTER TABLE "doctor" DROP COLUMN "additionalFiles",
ADD COLUMN     "additionalFiles" JSONB NOT NULL;
