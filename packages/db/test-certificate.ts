import 'dotenv/config';
import { prisma } from './index';

async function simulateCertificateRequest() {
  try {
    // 1. Find the target doctor user
    const doctorUser = await prisma.user.findUnique({
      where: { email: 'doctor@medcenter.lk' },
      include: { medicalCenterStaff: { include: { doctor: true } } }
    });

    if (!doctorUser || !doctorUser.medicalCenterStaff?.doctor) {
      console.error("❌ Error: No doctor found with email 'doctor@medcenter.lk' in the database.");
      console.log("👉 Please log in as Admin, create a Doctor with email 'doctor@medcenter.lk', set their password, and try again.");
      return;
    }

    const doctorId = doctorUser.id;

    // 2. Find a medical record to base the request on
    const record = await prisma.medicalRecord.findFirst({
      include: {
        patient: { include: { user: true } }
      }
    });

    if (!record) {
      console.error('❌ Error: No medical records found in the database.');
      console.log('👉 Please log in as a Doctor, search/select a patient, and submit a "Clinical Interaction Log" first.');
      return;
    }

    // 3. Temporarily update the record's doctor to doctor@medcenter.lk to satisfy foreign key links
    await prisma.medicalRecord.update({
      where: { id: record.id },
      data: { doctor_id: doctorId }
    });

    // 4. Delete any existing requests and certificates for this record to prevent duplicate key conflicts
    const existingRequest = await prisma.medicalCertificateRequest.findUnique({
      where: { record_id: record.id }
    });

    if (existingRequest) {
      await prisma.medicalCertificate.deleteMany({
        where: { request_id: existingRequest.id }
      });
      await prisma.extraCertificateRecipient.deleteMany({
        where: { request_id: existingRequest.id }
      });
      await prisma.medicalCertificateRequest.delete({
        where: { id: existingRequest.id }
      });
    }

    console.log(`Simulating certificate request for patient: ${record.patient.user.name}...`);
    console.log(`Assigned Doctor: Dr. ${doctorUser.name} (doctor@medcenter.lk)`);

    // 5. Create the pending request
    const certRequest = await prisma.medicalCertificateRequest.create({
      data: {
        patient_id: record.patient_id,
        doctor_id: doctorId,
        record_id: record.id,
        status: 'PENDING'
      }
    });

    console.log('✅ Simulated Certificate Request created successfully!');
    console.log('Request ID:', certRequest.id);
    console.log('\n📂 Log in as doctor@medcenter.lk and click "Certificates Panel" to review it!');
  } catch (err) {
    console.error('❌ Failed to simulate certificate request:', err);
  } finally {
    await prisma.$disconnect();
  }
}

simulateCertificateRequest();
