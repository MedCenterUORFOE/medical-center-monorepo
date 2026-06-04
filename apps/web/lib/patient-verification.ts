import { NextResponse } from 'next/server';
import { prisma } from '@medical-center/db';
import { apiErrors, errorResponse } from '@/lib/api-response';

/**
 * Blocks clinical actions when the target patient account is not VERIFIED.
 * Returns a NextResponse error payload, or null if the patient may proceed.
 */
export async function verifyPatientStatus(
  userId: string
): Promise<NextResponse | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, status: true },
  });

  if (!user) {
    return apiErrors.notFound('Patient account not found.');
  }

  if (user.status === 'UNVERIFIED') {
    return errorResponse(
      'Patient account is not verified. Clinical actions are blocked until email verification is complete.',
      403
    );
  }

  if (user.status === 'SUSPENDED') {
    return errorResponse(
      'Patient account is suspended. Clinical actions are blocked.',
      403
    );
  }

  return null;
}
