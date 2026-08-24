/*
  Warnings:

  - The `refundAmmount` column on the `payment` table would be dropped and recreated. This will lead to data loss if there is data in the column.

*/
-- AlterTable
ALTER TABLE "payment" DROP COLUMN "refundAmmount",
ADD COLUMN     "refundAmmount" DECIMAL(10,2);
