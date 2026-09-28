-- AlterTable
ALTER TABLE "Prescription" ADD COLUMN     "is_fulfilled" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "Prescription_is_fulfilled_issued_timestamp_idx" ON "Prescription"("is_fulfilled", "issued_timestamp");

-- Backfill
UPDATE "Prescription" p
SET "is_fulfilled" = NOT EXISTS (
  SELECT 1 FROM "PrescriptionItem" pi
  WHERE pi."prescription_id" = p."id"
    AND pi."source" = 'INTERNAL'
    AND pi."quantity" > COALESCE(
      (SELECT SUM(d."quantity") FROM "DispensedItem" d WHERE d."prescription_item_id" = pi."id"), 0)
);