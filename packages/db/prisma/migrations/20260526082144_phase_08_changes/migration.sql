-- AlterEnum
ALTER TYPE "EmergencyStatus" ADD VALUE 'ARRIVED';

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "fcm_token" TEXT;
