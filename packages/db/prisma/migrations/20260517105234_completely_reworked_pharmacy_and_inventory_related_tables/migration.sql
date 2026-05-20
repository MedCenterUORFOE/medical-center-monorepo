/*
  Warnings:

  - You are about to drop the column `inventory_id` on the `PrescriptionItem` table. All the data in the column will be lost.
  - You are about to drop the `Inventory` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "PrescriptionItem" DROP CONSTRAINT "PrescriptionItem_inventory_id_fkey";

-- AlterTable
ALTER TABLE "PrescriptionItem" DROP COLUMN "inventory_id",
ADD COLUMN     "external_medicine_name" TEXT,
ADD COLUMN     "medicine_id" TEXT;

-- DropTable
DROP TABLE "Inventory";

-- CreateTable
CREATE TABLE "Medicine" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "unit" TEXT NOT NULL,

    CONSTRAINT "Medicine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryBatch" (
    "id" TEXT NOT NULL,
    "medicine_id" TEXT NOT NULL,
    "batch_number" TEXT NOT NULL,
    "stock_quantity" INTEGER NOT NULL,
    "expiry_date" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InventoryBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DispensedItem" (
    "id" TEXT NOT NULL,
    "prescription_item_id" TEXT NOT NULL,
    "inventory_batch_id" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "dispensed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DispensedItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "InventoryBatch_medicine_id_batch_number_key" ON "InventoryBatch"("medicine_id", "batch_number");

-- AddForeignKey
ALTER TABLE "InventoryBatch" ADD CONSTRAINT "InventoryBatch_medicine_id_fkey" FOREIGN KEY ("medicine_id") REFERENCES "Medicine"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrescriptionItem" ADD CONSTRAINT "PrescriptionItem_medicine_id_fkey" FOREIGN KEY ("medicine_id") REFERENCES "Medicine"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DispensedItem" ADD CONSTRAINT "DispensedItem_prescription_item_id_fkey" FOREIGN KEY ("prescription_item_id") REFERENCES "PrescriptionItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DispensedItem" ADD CONSTRAINT "DispensedItem_inventory_batch_id_fkey" FOREIGN KEY ("inventory_batch_id") REFERENCES "InventoryBatch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
