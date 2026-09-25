import { NextResponse } from "next/server";
import { prisma } from "@medical-center/db";
import { getUserSession } from '@/lib/auth';

// ============================================================================
// POST: App එකෙන් අලුත් Appointment එකක් දාද්දී රන් වෙන කොටස (කලින් ලිව්ව එක)
// ============================================================================
export async function POST(request: Request) {
  try {
    const session = await getUserSession();
    
    if (!session || !session.id) {
      return NextResponse.json({ success: false, message: "Unauthorized. Please login first." }, { status: 401 });
    }

    const body = await request.json();
    const { doctor_id, scheduled_time, reason } = body;

    if (!doctor_id || !scheduled_time) {
      return NextResponse.json({ success: false, message: "Doctor ID and Scheduled Time are required" }, { status: 400 });
    }

    const newAppointment = await prisma.appointment.create({
      data: {
        doctor_id: doctor_id,
        patient_id: session.id, 
        scheduled_time: new Date(scheduled_time),
        reason: reason || "No reason provided",
        status: "SCHEDULED" 
      }
    });

    return NextResponse.json({ success: true, message: "Appointment booked successfully!", data: newAppointment }, { status: 201 });

  } catch (error) {
    console.error("❌ Appointment Booking Error:", error);
    return NextResponse.json({ success: false, message: "Server encountered an error while booking." }, { status: 500 });
  }
}

// ============================================================================
// GET: Dashboard එකට ලොග් වෙලා ඉන්න කෙනාගේ Appointments ටික යවන කොටස (අලුත් එක)
// ============================================================================

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function GET(_request: Request) {
  try {
    const session = await getUserSession();
    
    if (!session || !session.id) {
      return NextResponse.json({ success: false, message: "Unauthorized." }, { status: 401 });
    }

    let appointments;

    if (session.role === 'DOCTOR') {
      // Return scheduled appointments for this doctor, including patient user profile details
      appointments = await prisma.appointment.findMany({
        where: {
          doctor_id: session.id,
          status: 'SCHEDULED'
        },
        include: {
          patient: {
            include: {
              user: {
                select: {
                  name: true,
                  email: true,
                  nic: true,
                  role: true,
                  student: {
                    select: { university_reg_number: true }
                  },
                  academicStaff: {
                    select: { university_staff_id: true }
                  }
                }
              }
            }
          }
        },
        orderBy: {
          scheduled_time: 'asc'
        }
      });
    } else {
      // Normal patient appointments query
      appointments = await prisma.appointment.findMany({
        where: {
          patient_id: session.id
        },
        include: {
          doctor: {
            include: {
              staff: {
                include: {
                  user: true
                }
              }
            }
          }
        },
        orderBy: {
          scheduled_time: 'asc'
        }
      });
    }

    return NextResponse.json({ success: true, data: appointments }, { status: 200 });

  } catch (error) {
    console.error("❌ Fetching Appointments Error:", error);
    return NextResponse.json({ success: false, message: "Server error while fetching appointments." }, { status: 500 });
  }
}