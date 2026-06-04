/*
  Warnings:

  - A unique constraint covering the columns `[reset_token]` on the table `User` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "User" ADD COLUMN     "reset_expires" TIMESTAMP(3),
ADD COLUMN     "reset_token" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "User_reset_token_key" ON "User"("reset_token");
