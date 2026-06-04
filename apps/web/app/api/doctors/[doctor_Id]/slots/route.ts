import { prisma } from '@medical-center/db';
import { z } from 'zod';
import { successResponse, errorResponse, apiErrors } from '@/lib/api-response';
import { checkRateLimit } from '@/lib/rate-limiter';
import { getUserSession } from '@/lib/auth';

const querySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date format. Please use YYYY-MM-DD."),
});

// The standard duration for a medical consultation
const APPOINTMENT_DURATION_MINUTES = 15;

// ============================================================================
// GET: Fetch Available Time Slots for a Specific Doctor on a Specific Date
// ============================================================================
export async function GET(
  request: Request,
  { params }: { params: { doctor_id: string } }
) {
  try {
    // --- RATE LIMITING ---
    const forwardedFor = request.headers.get('x-forwarded-for');
    const ip = forwardedFor ? forwardedFor.split(',')[0] : 'unknown-ip';
    
    // Limit: 60 requests per minute to prevent scraping availability data
    if (!checkRateLimit(ip, 60, 60000)) { 
      return errorResponse('Too many requests. Please slow down.', 429);
    }

    // === PRODUCTION AUTH BLOCK ===
    const session = await getUserSession();
    if (!session?.id) return apiErrors.unauthorized();
    
    const { doctor_id } = params;
    const { searchParams } = new URL(request.url);
    const dateParam = searchParams.get('date');

    if (!dateParam) {
      return errorResponse("The 'date' query parameter is required (YYYY-MM-DD).", 400);
    }

    const parsedQuery = querySchema.safeParse({ date: dateParam });
    if (!parsedQuery.success) {
      return errorResponse("Invalid query parameter", 400, parsedQuery.error.errors);
    }

    // 1. Determine the Day of the Week (0 = Sunday, 1 = Monday, etc.)
    const requestedDate = new Date(dateParam);
    const dayOfWeek = requestedDate.getUTCDay(); 

    // 2. Fetch the Doctor's Availability Template for this specific day
    const availabilityTemplate = await prisma.doctorAvailability.findUnique({
      where: {
        doctor_id_day_of_week: {
          doctor_id: doctor_id,
          day_of_week: dayOfWeek
        }
      }
    });

    // If the doctor doesn't work this day, or is marked as unavailable, return empty array
    if (!availabilityTemplate || !availabilityTemplate.is_available) {
      return successResponse({ date: dateParam, slots: [] }, "Doctor is not available on this date.");
    }

    // 3. Construct the actual Start and End DateTime objects for the requested date
    const startHour = availabilityTemplate.start_time.getUTCHours();
    const startMin = availabilityTemplate.start_time.getUTCMinutes();
    const endHour = availabilityTemplate.end_time.getUTCHours();
    const endMin = availabilityTemplate.end_time.getUTCMinutes();

    const shiftStartTime = new Date(requestedDate);
    shiftStartTime.setUTCHours(startHour, startMin, 0, 0);

    const shiftEndTime = new Date(requestedDate);
    shiftEndTime.setUTCHours(endHour, endMin, 0, 0);

    // 4. Fetch existing appointments for this specific day to find out what is taken
    const startOfDay = new Date(requestedDate);
    startOfDay.setUTCHours(0, 0, 0, 0);
    const endOfDay = new Date(requestedDate);
    endOfDay.setUTCHours(23, 59, 59, 999);

    const existingAppointments = await prisma.appointment.findMany({
      where: {
        doctor_id: doctor_id,
        scheduled_time: {
          gte: startOfDay,
          lte: endOfDay
        },
        status: 'SCHEDULED' // Only scheduled appointments block time. Cancelled/Completed are ignored.
      },
      select: { scheduled_time: true }
    });

    // Convert booked times to an easily searchable set of epoch timestamps
    const bookedTimestamps = new Set(existingAppointments.map(app => app.scheduled_time.getTime()));

    // 5. Chop the shift into 15-minute intervals and filter out the booked ones
    const availableSlots: string[] = [];
    let currentSlot = new Date(shiftStartTime);

    while (currentSlot < shiftEndTime) {
      if (!bookedTimestamps.has(currentSlot.getTime())) {
        // Push as standard ISO string so the frontend can format it natively
        availableSlots.push(currentSlot.toISOString());
      }
      // Move forward by 15 minutes
      currentSlot = new Date(currentSlot.getTime() + APPOINTMENT_DURATION_MINUTES * 60000);
    }

    return successResponse(
      { date: dateParam, slots: availableSlots }, 
      "Available time slots retrieved successfully."
    );

  } catch (error) {
    console.error("Fetch Doctor Slots Error:", error);
    return apiErrors.internal();
  }
}