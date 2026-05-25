-- CreateTable
CREATE TABLE "PharmacistAvailability" (
    "pharmacist_id" TEXT NOT NULL,
    "day_of_week" INTEGER NOT NULL,
    "start_time" TIMESTAMP(3) NOT NULL,
    "end_time" TIMESTAMP(3) NOT NULL,
    "is_available" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "PharmacistAvailability_pkey" PRIMARY KEY ("pharmacist_id","day_of_week")
);

-- AddForeignKey
ALTER TABLE "PharmacistAvailability" ADD CONSTRAINT "PharmacistAvailability_pharmacist_id_fkey" FOREIGN KEY ("pharmacist_id") REFERENCES "Pharmacist"("pharmacist_id") ON DELETE CASCADE ON UPDATE CASCADE;
