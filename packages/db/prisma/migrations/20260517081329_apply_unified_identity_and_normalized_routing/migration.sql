/*
  Warnings:

  - The primary key for the `EmergencyRecord` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to drop the column `dispatched_at` on the `EmergencyRequest` table. All the data in the column will be lost.
  - You are about to drop the column `location_lat` on the `EmergencyRequest` table. All the data in the column will be lost.
  - You are about to drop the column `location_lng` on the `EmergencyRequest` table. All the data in the column will be lost.
  - You are about to drop the column `department` on the `ExtraCertificateRecipient` table. All the data in the column will be lost.
  - You are about to drop the column `rejection_reason` on the `MedicalCertificateRequest` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[request_id]` on the table `EmergencyRecord` will be added. If there are existing duplicate values, this will fail.
  - The required column `id` was added to the `EmergencyRecord` table with a prisma-level default value. This is not possible if the table is not empty. Please add this column as optional, then populate it before making it required.
  - Added the required column `patient_location_lat` to the `EmergencyRequest` table without a default value. This is not possible if the table is not empty.
  - Added the required column `patient_location_lng` to the `EmergencyRequest` table without a default value. This is not possible if the table is not empty.
  - Added the required column `record_id` to the `MedicalCertificateRequest` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "EmergencyRecord" DROP CONSTRAINT "EmergencyRecord_pkey",
ADD COLUMN     "dispatched_at" TIMESTAMP(3),
ADD COLUMN     "id" TEXT NOT NULL,
ADD CONSTRAINT "EmergencyRecord_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "EmergencyRequest" DROP COLUMN "dispatched_at",
DROP COLUMN "location_lat",
DROP COLUMN "location_lng",
ADD COLUMN     "driver_location_lat" DOUBLE PRECISION,
ADD COLUMN     "driver_location_lng" DOUBLE PRECISION,
ADD COLUMN     "patient_location_lat" DOUBLE PRECISION NOT NULL,
ADD COLUMN     "patient_location_lng" DOUBLE PRECISION NOT NULL;

-- AlterTable
ALTER TABLE "ExtraCertificateRecipient" DROP COLUMN "department";

-- AlterTable
ALTER TABLE "MedicalCertificateRequest" DROP COLUMN "rejection_reason",
ADD COLUMN     "record_id" TEXT NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "EmergencyRecord_request_id_key" ON "EmergencyRecord"("request_id");

-- AddForeignKey
ALTER TABLE "MedicalCertificateRequest" ADD CONSTRAINT "MedicalCertificateRequest_record_id_fkey" FOREIGN KEY ("record_id") REFERENCES "MedicalRecord"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
