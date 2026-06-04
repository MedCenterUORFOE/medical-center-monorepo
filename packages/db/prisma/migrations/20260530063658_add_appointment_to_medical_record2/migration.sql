/*
  Warnings:

  - A unique constraint covering the columns `[appointment_id]` on the table `MedicalRecord` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "MedicalRecord" ADD COLUMN     "appointment_id" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "MedicalRecord_appointment_id_key" ON "MedicalRecord"("appointment_id");

-- AddForeignKey
ALTER TABLE "MedicalRecord" ADD CONSTRAINT "MedicalRecord_appointment_id_fkey" FOREIGN KEY ("appointment_id") REFERENCES "Appointment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
