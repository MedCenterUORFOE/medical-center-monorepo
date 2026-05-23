/*
  Warnings:

  - Added the required column `symptoms` to the `MedicalRecord` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "MedicalRecord" ADD COLUMN     "follow_up_date" TIMESTAMP(3),
ADD COLUMN     "prescription_notes" TEXT,
ADD COLUMN     "symptoms" TEXT NOT NULL,
ADD COLUMN     "treatment_plan" TEXT;
