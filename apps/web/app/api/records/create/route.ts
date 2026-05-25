
import { prisma } from '@medical-center/db';
import { z } from 'zod';
import { successResponse, errorResponse, apiErrors } from '@/lib/api-response';
import { checkRateLimit } from '@/lib/rate-limiter';
// import { getUserSession } from '@/lib/auth';

// -----------------------------------------------------------------------------
// ZOD VALIDATION SCHEMAS
// -----------------------------------------------------------------------------

const prescriptionItemSchema = z.object({
  medicine_id: z.string().nullable().optional(),
  external_medicine_name: z.string().nullable().optional(),
  dosage: z.string(),
  quantity: z.number().int().positive("Quantity must be a positive integer"),
  instructions: z.string().optional(),
  source: z.enum(["INTERNAL", "EXTERNAL"]),
}).superRefine((data, ctx) => {
  // Guardrail: Enforce correct fields based on INTERNAL vs EXTERNAL source
  if (data.source === "INTERNAL" && !data.medicine_id) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "medicine_id is required when source is INTERNAL",
      path: ["medicine_id"],
    });
  }
  if (data.source === "EXTERNAL" && !data.external_medicine_name) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "external_medicine_name is required when source is EXTERNAL",
      path: ["external_medicine_name"],
    });
  }
});

const createRecordSchema = z.object({
  patient_id: z.string().uuid("Invalid Patient ID format"),
  symptoms: z.string().min(2, "Symptoms are required"),
  diagnosis: z.string().min(2, "Diagnosis is required"),
  treatment_plan: z.string().optional(),
  prescription_notes: z.string().optional(),
  follow_up_date: z.coerce.date().optional(),
  notes: z.string().optional(),
  
  // Nested prescription array matching Member B's payload structure
  prescription: z.object({
    items: z.array(prescriptionItemSchema)
  }).optional(),
});

// ============================================================================
// POST: Create Medical Record & Associated Prescription
// ============================================================================
export async function POST(request: Request) {
  try {
    // --- RATE LIMITING ---
    const forwardedFor = request.headers.get('x-forwarded-for');
    const ip = forwardedFor ? forwardedFor.split(',')[0] : 'unknown-ip';
    
    // Strict limit: 30 records created per minute per IP to prevent spam
    if (!checkRateLimit(ip, 30, 60000)) { 
      return errorResponse('Too many requests. Please slow down.', 429);
    }

    // === PRODUCTION AUTH & RBAC BLOCK ===
    // const session = await getUserSession();
    // if (!session?.id) return apiErrors.unauthorized();
    // 
    // if (session.role !== "DOCTOR") {
    //   return apiErrors.forbidden("Only Doctors can create medical records.");
    // }
    // const doctorId = session.id;

    // === LOCAL TESTING MOCK ===
    const doctorId = "test-doctor-id"; 

    const body = await request.json();
    const validatedData = createRecordSchema.parse(body);

    // Verify the patient actually exists before writing clinical data
    const patientExists = await prisma.patientProfile.findUnique({
      where: { user_id: validatedData.patient_id }
    });

    if (!patientExists) {
      return apiErrors.notFound("Patient profile not found. Cannot create record.");
    }

    // --- THE MASSIVE TRANSACTION ---
    // If any step fails (e.g., invalid medicine ID), the entire block rolls back
    const result = await prisma.$transaction(async (tx) => {
      
      // 1. Create the Base Medical Record
      const record = await tx.medicalRecord.create({
        data: {
          patient_id: validatedData.patient_id,
          doctor_id: doctorId,
          symptoms: validatedData.symptoms,
          diagnosis: validatedData.diagnosis,
          treatment_plan: validatedData.treatment_plan,
          prescription_notes: validatedData.prescription_notes,
          follow_up_date: validatedData.follow_up_date,
          notes: validatedData.notes,
        }
      });

      // 2. Create the Prescription & Items (If provided)
      let createdPrescription = null;
      
      if (validatedData.prescription?.items && validatedData.prescription.items.length > 0) {
        createdPrescription = await tx.prescription.create({
          data: {
            record_id: record.id,
            doctor_id: doctorId,
            // Using Prisma's nested write capability to create all items instantly
            items: {
              create: validatedData.prescription.items.map(item => ({
                medicine_id: item.medicine_id,
                external_medicine_name: item.external_medicine_name,
                dosage: item.dosage,
                quantity: item.quantity,
                instructions: item.instructions,
                source: item.source
              }))
            }
          },
          include: { items: true } // Return the created items in the response
        });
      }

      // 3. Write the Immutable Audit Log
      await tx.auditLog.create({
        data: {
          user_id: doctorId,
          action: "CREATED_MEDICAL_RECORD",
          entity_type: "MedicalRecord",
          entity_id: record.id,
          ip_address: ip,
          details: JSON.stringify({ 
            patient_id: validatedData.patient_id,
            has_prescription: !!createdPrescription 
          }),
        }
      });

      return { record, prescription: createdPrescription };
    });

    return successResponse(result, "Medical record created successfully.", 201);

  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.errors);
    }
    console.error("Medical Record Creation Error:", error);
    return apiErrors.internal();
  }
}