/*
  Warnings:

  - The primary key for the `AcademicStaff` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to drop the column `user_id` on the `AcademicStaff` table. All the data in the column will be lost.
  - The primary key for the `AmbulanceDriver` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to drop the column `user_id` on the `AmbulanceDriver` table. All the data in the column will be lost.
  - The primary key for the `Doctor` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to drop the column `staff_id` on the `Doctor` table. All the data in the column will be lost.
  - The primary key for the `MedicalCenterStaff` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to drop the column `user_id` on the `MedicalCenterStaff` table. All the data in the column will be lost.
  - The primary key for the `Nurse` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to drop the column `staff_id` on the `Nurse` table. All the data in the column will be lost.
  - The primary key for the `Student` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to drop the column `user_id` on the `Student` table. All the data in the column will be lost.
  - You are about to drop the `CertificateRecipient` table. If the table is not empty, all the data it contains will be lost.
  - A unique constraint covering the columns `[university_staff_id]` on the table `AcademicStaff` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[university_email]` on the table `AcademicStaff` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[university_staff_id]` on the table `AmbulanceDriver` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[university_staff_id]` on the table `MedicalCenterStaff` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[university_reg_number]` on the table `Student` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[university_email]` on the table `Student` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `academic_staff_id` to the `AcademicStaff` table without a default value. This is not possible if the table is not empty.
  - Added the required column `university_staff_id` to the `AcademicStaff` table without a default value. This is not possible if the table is not empty.
  - Added the required column `driver_id` to the `AmbulanceDriver` table without a default value. This is not possible if the table is not empty.
  - Added the required column `doctor_id` to the `Doctor` table without a default value. This is not possible if the table is not empty.
  - Added the required column `staff_id` to the `MedicalCenterStaff` table without a default value. This is not possible if the table is not empty.
  - Added the required column `nurse_id` to the `Nurse` table without a default value. This is not possible if the table is not empty.
  - Added the required column `student_id` to the `Student` table without a default value. This is not possible if the table is not empty.
  - Added the required column `university_reg_number` to the `Student` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "AcademicStaff" DROP CONSTRAINT "AcademicStaff_user_id_fkey";

-- DropForeignKey
ALTER TABLE "AmbulanceDriver" DROP CONSTRAINT "AmbulanceDriver_user_id_fkey";

-- DropForeignKey
ALTER TABLE "Appointment" DROP CONSTRAINT "Appointment_doctor_id_fkey";

-- DropForeignKey
ALTER TABLE "CertificateRecipient" DROP CONSTRAINT "CertificateRecipient_recipient_user_id_fkey";

-- DropForeignKey
ALTER TABLE "CertificateRecipient" DROP CONSTRAINT "CertificateRecipient_request_id_fkey";

-- DropForeignKey
ALTER TABLE "Doctor" DROP CONSTRAINT "Doctor_staff_id_fkey";

-- DropForeignKey
ALTER TABLE "DoctorAvailability" DROP CONSTRAINT "DoctorAvailability_doctor_id_fkey";

-- DropForeignKey
ALTER TABLE "DriverAvailability" DROP CONSTRAINT "DriverAvailability_driver_id_fkey";

-- DropForeignKey
ALTER TABLE "EmergencyRequest" DROP CONSTRAINT "EmergencyRequest_driver_id_fkey";

-- DropForeignKey
ALTER TABLE "MedicalCenterStaff" DROP CONSTRAINT "MedicalCenterStaff_user_id_fkey";

-- DropForeignKey
ALTER TABLE "MedicalCertificate" DROP CONSTRAINT "MedicalCertificate_doctor_id_fkey";

-- DropForeignKey
ALTER TABLE "MedicalCertificateRequest" DROP CONSTRAINT "MedicalCertificateRequest_doctor_id_fkey";

-- DropForeignKey
ALTER TABLE "MedicalRecord" DROP CONSTRAINT "MedicalRecord_doctor_id_fkey";

-- DropForeignKey
ALTER TABLE "Nurse" DROP CONSTRAINT "Nurse_staff_id_fkey";

-- DropForeignKey
ALTER TABLE "NurseAvailability" DROP CONSTRAINT "NurseAvailability_nurse_id_fkey";

-- DropForeignKey
ALTER TABLE "Prescription" DROP CONSTRAINT "Prescription_doctor_id_fkey";

-- DropForeignKey
ALTER TABLE "Student" DROP CONSTRAINT "Student_user_id_fkey";

-- AlterTable
ALTER TABLE "AcademicStaff" DROP CONSTRAINT "AcademicStaff_pkey",
DROP COLUMN "user_id",
ADD COLUMN     "academic_staff_id" TEXT NOT NULL,
ADD COLUMN     "university_email" TEXT,
ADD COLUMN     "university_staff_id" TEXT NOT NULL,
ADD CONSTRAINT "AcademicStaff_pkey" PRIMARY KEY ("academic_staff_id");

-- AlterTable
ALTER TABLE "AmbulanceDriver" DROP CONSTRAINT "AmbulanceDriver_pkey",
DROP COLUMN "user_id",
ADD COLUMN     "driver_id" TEXT NOT NULL,
ADD COLUMN     "university_staff_id" TEXT,
ADD CONSTRAINT "AmbulanceDriver_pkey" PRIMARY KEY ("driver_id");

-- AlterTable
ALTER TABLE "Doctor" DROP CONSTRAINT "Doctor_pkey",
DROP COLUMN "staff_id",
ADD COLUMN     "doctor_id" TEXT NOT NULL,
ADD CONSTRAINT "Doctor_pkey" PRIMARY KEY ("doctor_id");

-- AlterTable
ALTER TABLE "MedicalCenterStaff" DROP CONSTRAINT "MedicalCenterStaff_pkey",
DROP COLUMN "user_id",
ADD COLUMN     "staff_id" TEXT NOT NULL,
ADD COLUMN     "university_staff_id" TEXT,
ADD CONSTRAINT "MedicalCenterStaff_pkey" PRIMARY KEY ("staff_id");

-- AlterTable
ALTER TABLE "Nurse" DROP CONSTRAINT "Nurse_pkey",
DROP COLUMN "staff_id",
ADD COLUMN     "nurse_id" TEXT NOT NULL,
ADD CONSTRAINT "Nurse_pkey" PRIMARY KEY ("nurse_id");

-- AlterTable
ALTER TABLE "Student" DROP CONSTRAINT "Student_pkey",
DROP COLUMN "user_id",
ADD COLUMN     "department" TEXT,
ADD COLUMN     "guardian_name" TEXT,
ADD COLUMN     "student_id" TEXT NOT NULL,
ADD COLUMN     "university_email" TEXT,
ADD COLUMN     "university_reg_number" TEXT NOT NULL,
ADD CONSTRAINT "Student_pkey" PRIMARY KEY ("student_id");

-- DropTable
DROP TABLE "CertificateRecipient";

-- CreateTable
CREATE TABLE "ExtraCertificateRecipient" (
    "id" TEXT NOT NULL,
    "request_id" TEXT NOT NULL,
    "staff_id" TEXT NOT NULL,
    "department" TEXT,
    "sent_at" TIMESTAMP(3),

    CONSTRAINT "ExtraCertificateRecipient_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AcademicStaff_university_staff_id_key" ON "AcademicStaff"("university_staff_id");

-- CreateIndex
CREATE UNIQUE INDEX "AcademicStaff_university_email_key" ON "AcademicStaff"("university_email");

-- CreateIndex
CREATE UNIQUE INDEX "AmbulanceDriver_university_staff_id_key" ON "AmbulanceDriver"("university_staff_id");

-- CreateIndex
CREATE UNIQUE INDEX "MedicalCenterStaff_university_staff_id_key" ON "MedicalCenterStaff"("university_staff_id");

-- CreateIndex
CREATE UNIQUE INDEX "Student_university_reg_number_key" ON "Student"("university_reg_number");

-- CreateIndex
CREATE UNIQUE INDEX "Student_university_email_key" ON "Student"("university_email");

-- AddForeignKey
ALTER TABLE "Student" ADD CONSTRAINT "Student_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AcademicStaff" ADD CONSTRAINT "AcademicStaff_academic_staff_id_fkey" FOREIGN KEY ("academic_staff_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MedicalCenterStaff" ADD CONSTRAINT "MedicalCenterStaff_staff_id_fkey" FOREIGN KEY ("staff_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AmbulanceDriver" ADD CONSTRAINT "AmbulanceDriver_driver_id_fkey" FOREIGN KEY ("driver_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Doctor" ADD CONSTRAINT "Doctor_doctor_id_fkey" FOREIGN KEY ("doctor_id") REFERENCES "MedicalCenterStaff"("staff_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Nurse" ADD CONSTRAINT "Nurse_nurse_id_fkey" FOREIGN KEY ("nurse_id") REFERENCES "MedicalCenterStaff"("staff_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_doctor_id_fkey" FOREIGN KEY ("doctor_id") REFERENCES "Doctor"("doctor_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MedicalRecord" ADD CONSTRAINT "MedicalRecord_doctor_id_fkey" FOREIGN KEY ("doctor_id") REFERENCES "Doctor"("doctor_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Prescription" ADD CONSTRAINT "Prescription_doctor_id_fkey" FOREIGN KEY ("doctor_id") REFERENCES "Doctor"("doctor_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmergencyRequest" ADD CONSTRAINT "EmergencyRequest_requester_id_fkey" FOREIGN KEY ("requester_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmergencyRequest" ADD CONSTRAINT "EmergencyRequest_driver_id_fkey" FOREIGN KEY ("driver_id") REFERENCES "AmbulanceDriver"("driver_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MedicalCertificateRequest" ADD CONSTRAINT "MedicalCertificateRequest_doctor_id_fkey" FOREIGN KEY ("doctor_id") REFERENCES "Doctor"("doctor_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExtraCertificateRecipient" ADD CONSTRAINT "ExtraCertificateRecipient_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "MedicalCertificateRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExtraCertificateRecipient" ADD CONSTRAINT "ExtraCertificateRecipient_staff_id_fkey" FOREIGN KEY ("staff_id") REFERENCES "AcademicStaff"("academic_staff_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MedicalCertificate" ADD CONSTRAINT "MedicalCertificate_doctor_id_fkey" FOREIGN KEY ("doctor_id") REFERENCES "Doctor"("doctor_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DoctorAvailability" ADD CONSTRAINT "DoctorAvailability_doctor_id_fkey" FOREIGN KEY ("doctor_id") REFERENCES "Doctor"("doctor_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NurseAvailability" ADD CONSTRAINT "NurseAvailability_nurse_id_fkey" FOREIGN KEY ("nurse_id") REFERENCES "Nurse"("nurse_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DriverAvailability" ADD CONSTRAINT "DriverAvailability_driver_id_fkey" FOREIGN KEY ("driver_id") REFERENCES "AmbulanceDriver"("driver_id") ON DELETE CASCADE ON UPDATE CASCADE;
