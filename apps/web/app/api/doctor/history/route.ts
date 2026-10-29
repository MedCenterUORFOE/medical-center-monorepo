// apps/web/app/api/doctor/history/route.ts

import { prisma } from '@medical-center/db';
import { successResponse, errorResponse, apiErrors } from '@/lib/api-response';
import { getUserSession } from '@/lib/auth';

// Valid period values
const VALID_PERIODS = ['today', 'week', 'month', 'all'] as const;
type Period = (typeof VALID_PERIODS)[number];

function getDateFilter(period: Period): { gte: Date; lte: Date } | undefined {
  const now = new Date();

  if (period === 'today') {
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    const end = new Date(now);
    end.setHours(23, 59, 59, 999);
    return { gte: start, lte: end };
  }

  if (period === 'week') {
    // Week starts on Monday
    const dayOfWeek = now.getDay(); // 0 = Sunday
    const daysFromMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    const start = new Date(now);
    start.setDate(now.getDate() - daysFromMonday);
    start.setHours(0, 0, 0, 0);
    return { gte: start, lte: now };
  }

  if (period === 'month') {
    const start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
    return { gte: start, lte: now };
  }

  return undefined; // 'all' — no date filter
}

// ============================================================================
// GET: Doctor Treatment History (filtered by period, paginated)
// GET /api/doctor/history?period=today|week|month|all&page=1&limit=20
// ============================================================================
export async function GET(request: Request) {
  try {
    const session = await getUserSession();
    if (!session?.id) return apiErrors.unauthorized();

    if (session.role !== 'DOCTOR') {
      return apiErrors.forbidden('Only doctors can access their treatment history.');
    }

    const { searchParams } = new URL(request.url);

    // --- Validate period ---
    const rawPeriod = (searchParams.get('period') ?? 'all') as Period;
    if (!VALID_PERIODS.includes(rawPeriod)) {
      return errorResponse('Invalid period. Expected today, week, month, or all.', 400);
    }

    // --- Validate pagination ---
    const rawPage  = parseInt(searchParams.get('page')  ?? '1',  10);
    const rawLimit = parseInt(searchParams.get('limit') ?? '20', 10);
    const page  = isNaN(rawPage)  || rawPage  < 1   ? 1   : rawPage;
    const limit = isNaN(rawLimit) || rawLimit < 1   ? 20  : Math.min(rawLimit, 100);
    const skip  = (page - 1) * limit;

    const dateRange = getDateFilter(rawPeriod);
    const whereClause = {
      doctor_id: session.id,
      ...(dateRange ? { visit_date_time: dateRange } : {}),
    };

    // Run count + records in parallel for performance
    const [total, records] = await Promise.all([
      prisma.medicalRecord.count({ where: whereClause }),
      prisma.medicalRecord.findMany({
        where: whereClause,
        orderBy: { visit_date_time: 'desc' },
        skip,
        take: limit,
        include: {
          patient: {
            include: {
              user: {
                select: {
                  id: true,
                  name: true,
                  email: true,
                  nic: true,
                  role: true,
                  student: {
                    select: { university_reg_number: true },
                  },
                  academicStaff: {
                    select: { university_staff_id: true },
                  },
                },
              },
            },
          },
          prescription: {
            include: {
              items: {
                include: {
                  medicine: { select: { name: true } },
                },
              },
            },
          },
        },
      }),
    ]);

    // --- Transform: flatten patient + derive registration_number ---
    const formattedRecords = records.map((record) => {
      const user = record.patient.user;
      const registrationNumber =
        user.student?.university_reg_number ??
        user.academicStaff?.university_staff_id ??
        null;

      const prescription = record.prescription
        ? {
            id: record.prescription.id,
            issued_timestamp: record.prescription.issued_timestamp,
            items: record.prescription.items.map((item) => ({
              id: item.id,
              medicine_id: item.medicine_id,
              medicine_name: item.medicine?.name ?? null,
              external_medicine_name: item.external_medicine_name,
              dosage: item.dosage,
              quantity: item.quantity,
              instructions: item.instructions,
              source: item.source,
            })),
          }
        : null;

      return {
        id: record.id,
        visit_date_time: record.visit_date_time,
        patient: {
          id: user.id,
          name: user.name,
          email: user.email,
          nic: user.nic,
          role: user.role,
          registration_number: registrationNumber,
        },
        symptoms: record.symptoms,
        diagnosis: record.diagnosis,
        treatment_plan: record.treatment_plan,
        prescription_notes: record.prescription_notes,
        follow_up_date: record.follow_up_date,
        notes: record.notes,
        prescription,
      };
    });

    // --- Summary counts ---
    const totalPrescriptions = formattedRecords.filter((r) => r.prescription !== null).length;

    const periodStart = dateRange?.gte ?? null;
    const periodEnd   = dateRange?.lte ?? new Date();

    return successResponse(
      {
        period: rawPeriod,
        records: formattedRecords,
        summary: {
          total_records: total,
          total_prescriptions: totalPrescriptions,
          period_start: periodStart,
          period_end: periodEnd,
        },
        pagination: {
          page,
          limit,
          total,
          total_pages: Math.ceil(total / limit),
        },
      },
      total > 0
        ? 'Doctor history retrieved successfully.'
        : 'No records found for the selected period.'
    );
  } catch (error) {
    console.error('Doctor History Fetch Error:', error);
    return apiErrors.internal();
  }
}
