import { NextResponse } from "next/server";
import { prisma } from "@medical-center/db";

export async function GET() {
  try {
    // 1. ඇත්තම Database එකේ Doctor Table එකෙන් ඩොක්ටර්ස්ලාව ගන්නවා
    const doctorsData = await prisma.doctor.findMany({
      include: {
        staff: {
          include: {
            user: true // ඩොක්ටර්ගේ නම ගන්නවා
          }
        }
      }
    });

    // 2. App එකට තේරෙන විදිහට සකස් කිරීම
    const doctors = doctorsData.map((doc) => ({
      id: doc.doctor_id,
      name: doc.staff?.user?.name || `Doctor (${doc.doctor_id.substring(0, 4)})`, 
    }));

    return NextResponse.json({ success: true, doctors }, { status: 200 });
  } catch (error) {
    console.error("Failed to fetch doctors:", error);
    return NextResponse.json(
      { success: false, message: "Failed to fetch doctors" },
      { status: 500 }
    );
  }
}