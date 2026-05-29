import { prisma } from '@medical-center/db';
import { successResponse, apiErrors } from '@/lib/api-response';
import { supabase } from '@/lib/supabase';
import { generatePDF } from '@/lib/pdf-generator'; // Assume you use a library like 'pdfkit' or 'puppeteer'
import { getUserSession } from '@/lib/auth';

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    // === PRODUCTION AUTH BLOCK ===
    const session = await getUserSession();
    if (!session?.id) return apiErrors.unauthorized();
    if (session.role !== "DOCTOR") return apiErrors.forbidden("Only doctors can generate certificates.");

    const { id } = params; // Certificate Request ID

    // 1. Fetch Request Details
    const requestData = await prisma.medicalCertificateRequest.findUnique({
      where: { id },
      include: { patient: { include: { user: true } }, record: true }
    });

    if (!requestData) return apiErrors.notFound();

    // 2. Generate PDF Buffer
    const pdfBuffer = await generatePDF({
      patientName: requestData.patient.user.name,
      diagnosis: requestData.record.diagnosis,
      date: new Date().toISOString()
    });

    // 3. Upload to Supabase
    const path = `certificates/${id}.pdf`;
    await supabase.storage.from('medical-documents').upload(path, pdfBuffer, {
      contentType: 'application/pdf',
      upsert: true
    });

    // 4. Record the file path in the database
    const cert = await prisma.medicalCertificate.create({
      data: {
        request_id: id,
        doctor_id: requestData.doctor_id,
        record_id: requestData.record_id,
        file_url: path
      }
    });

    return successResponse(cert, "Certificate generated and saved.");
  } catch (error) {
    return apiErrors.internal();
  }
}