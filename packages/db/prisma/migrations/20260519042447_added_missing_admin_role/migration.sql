/*
  Warnings:

  - You are about to drop the column `guardian_name` on the `Student` table. All the data in the column will be lost.

*/
-- AlterEnum
ALTER TYPE "Role" ADD VALUE 'ADMIN';

-- AlterTable
ALTER TABLE "Student" DROP COLUMN "guardian_name";
