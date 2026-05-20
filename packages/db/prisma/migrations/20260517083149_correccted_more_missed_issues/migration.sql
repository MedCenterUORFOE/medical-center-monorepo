/*
  Warnings:

  - The values [ADMIN] on the enum `Role` will be removed. If these variants are still used in the database, this will fail.
  - You are about to drop the column `emergency_contact` on the `AcademicStaff` table. All the data in the column will be lost.
  - You are about to drop the column `guardian_contact` on the `Student` table. All the data in the column will be lost.
  - Added the required column `emergency_contact_number` to the `AcademicStaff` table without a default value. This is not possible if the table is not empty.
  - Added the required column `emergency_contact_number` to the `Student` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('UNVERIFIED', 'VERIFIED', 'SUSPENDED');

-- AlterEnum
BEGIN;
CREATE TYPE "Role_new" AS ENUM ('STUDENT', 'ACADEMIC_STAFF', 'DOCTOR', 'NURSE', 'AMBULANCE_DRIVER');
ALTER TABLE "User" ALTER COLUMN "role" TYPE "Role_new" USING ("role"::text::"Role_new");
ALTER TYPE "Role" RENAME TO "Role_old";
ALTER TYPE "Role_new" RENAME TO "Role";
DROP TYPE "public"."Role_old";
COMMIT;

-- AlterTable
ALTER TABLE "AcademicStaff" DROP COLUMN "emergency_contact",
ADD COLUMN     "emergency_contact_name" TEXT,
ADD COLUMN     "emergency_contact_number" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "Student" DROP COLUMN "guardian_contact",
ADD COLUMN     "emergency_contact_name" TEXT,
ADD COLUMN     "emergency_contact_number" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "status" "UserStatus" NOT NULL DEFAULT 'UNVERIFIED';
