-- AlterEnum
ALTER TYPE "Role" ADD VALUE 'PHARMACIST';

-- CreateTable
CREATE TABLE "Pharmacist" (
    "pharmacist_id" TEXT NOT NULL,

    CONSTRAINT "Pharmacist_pkey" PRIMARY KEY ("pharmacist_id")
);

-- AddForeignKey
ALTER TABLE "Pharmacist" ADD CONSTRAINT "Pharmacist_pharmacist_id_fkey" FOREIGN KEY ("pharmacist_id") REFERENCES "MedicalCenterStaff"("staff_id") ON DELETE CASCADE ON UPDATE CASCADE;
