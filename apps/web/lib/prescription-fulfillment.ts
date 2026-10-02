import { prisma } from '@medical-center/db';

type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

export async function recomputePrescriptionFulfillment(tx: Tx, prescriptionId: string) {
  const items = await tx.prescriptionItem.findMany({
    where: { prescription_id: prescriptionId, source: 'INTERNAL' },
    select: { quantity: true, dispensations: { select: { quantity: true } } },
  });
  const hasOpenItem = items.some(
    (i) => i.quantity - i.dispensations.reduce((s, d) => s + d.quantity, 0) > 0
  );
  await tx.prescription.update({
    where: { id: prescriptionId },
    data: { is_fulfilled: !hasOpenItem },
  });
}
