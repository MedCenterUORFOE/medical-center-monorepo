import { NextResponse } from 'next/server';
import prisma from '@medical-center/db';
import { z } from 'zod';
import { checkRateLimit } from '@/lib/rate-limiter';
import { successResponse, errorResponse, apiErrors } from '@/lib/api-response';
// import { getUserSession } from '@/lib/auth';

// Validate the clinical record before it ever touches the database
const medicalRecordSchema = z.object({
  patient_id: z.string().min(1, "Patient ID is required"),
  symptoms: z.string().min(2, "Symptoms must be recorded"),
  diagnosis: z.string().min(2, "Diagnosis is required"),
  treatment_plan: z.string().optional(),
  prescription_notes: z.string().optional(),
  follow_up_date: z.coerce.date().optional(),
});

export async function POST(request: Request) {
  try {
    // --- RATE LIMITING ---
    const forwardedFor = request.headers.get('x-forwarded-for');
    const ip = forwardedFor ? forwardedFor.split(',')[0] : 'unknown-ip';
    
    // 40 records per hour per IP. (A doctor shouldn't be seeing more than 40 patients an hour!)
    if (!checkRateLimit(ip, 40, 3600000)) { 
      return errorResponse('Too many records submitted. Please slow down.', 429);
    }

    // === PRODUCTION AUTH & RBAC BLOCK ===
    // const session = await getUserSession();
    // if (!session?.id) return apiErrors.unauthorized();
    // 
    // // Strictly DOCTORS and NURSES can write medical records
    // if (session.role !== "NURSE" && session.role !== "DOCTOR") {
    //   return apiErrors.forbidden("Only certified medical staff can create clinical records.");
    // }
    // const doctorId = session.id;

    // === LOCAL TESTING MOCK ===
    const doctorId = "test-doctor-id"; 

    const body = await request.json();
    const validatedData = medicalRecordSchema.parse(body);

    // Ensure the patient actually exists and isn't suspended
    const patientExists = await prisma.user.findUnique({
      where: { id: validatedData.patient_id, status: { not: 'SUSPENDED' } }
    });

    if (!patientExists) {
      return apiErrors.notFound("Valid patient profile not found.");
    }

    // --- THE SECURE CLINICAL TRANSACTION ---
    const record = await prisma.$transaction(async (tx) => {
      
      // 1. Create the Medical Record
      const newRecord = await tx.medicalRecord.create({
        data: {
          patient_id: validatedData.patient_id,
          doctor_id: doctorId,
          symptoms: validatedData.symptoms,
          diagnosis: validatedData.diagnosis,
          treatment_plan: validatedData.treatment_plan,
          prescription_notes: validatedData.prescription_notes,
          follow_up_date: validatedData.follow_up_date,
        }
      });

      // 2. Write to the Immutable Audit Ledger
      await tx.auditLog.create({
        data: {
          user_id: doctorId, 
          action: "MEDICAL_RECORD_CREATED",
          entity_type: "MedicalRecord",
          entity_id: newRecord.id, 
          ip_address: ip,
          details: JSON.stringify({ 
            message: "Doctor created a new clinical encounter record.",
            patient_id: validatedData.patient_id
          }),
        }
      });

      return newRecord;
    });

    return successResponse(
      { recordId: record.id }, 
      "Medical record saved successfully.", 
      201
    );

  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.errors);
    }
    console.error("Medical Record Creation Error:", error);
    return apiErrors.internal();
  }
}