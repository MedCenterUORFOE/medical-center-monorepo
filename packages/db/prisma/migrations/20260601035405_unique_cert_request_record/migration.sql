/*
  Warnings:

  - A unique constraint covering the columns `[record_id]` on the table `MedicalCertificateRequest` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "MedicalCertificateRequest_record_id_key" ON "MedicalCertificateRequest"("record_id");
