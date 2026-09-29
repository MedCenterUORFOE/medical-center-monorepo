import 'dotenv/config';
import { prisma } from './index';

async function simulateEmergency() {
  try {
    // 1. Get a student/academic staff user to act as the requester
    const requester = await prisma.user.findFirst({
      where: { role: 'STUDENT' }
    });

    if (!requester) {
      console.error('❌ Error: No student user found in the database. Please create a student account or seed the database first.');
      return;
    }

    // 2. Center coordinates around University of Ruhuna (Matara, Sri Lanka)
    // Patient pickup: random offset around 5.938, 80.576
    const patientLat = 5.9381 + (Math.random() - 0.5) * 0.01;
    const patientLng = 80.5761 + (Math.random() - 0.5) * 0.01;

    console.log(`Inserting simulated emergency request for patient: ${requester.name}...`);
    
    const newRequest = await prisma.emergencyRequest.create({
      data: {
        requester_id: requester.id,
        patient_location_lat: patientLat,
        patient_location_lng: patientLng,
        status: 'PENDING',
      }
    });

    console.log('✅ Simulated Emergency Request created successfully!');
    console.log('Request ID:', newRequest.id);
    console.log(`Coordinates: Lat ${patientLat.toFixed(6)} | Lng ${patientLng.toFixed(6)}`);
    console.log('\n🔊 If you have the Emergency Dashboard open, you should have heard the double-beep alarm and the incident should have mapped instantly!');
  } catch (err) {
    console.error('❌ Failed to simulate emergency:', err);
  } finally {
    await prisma.$disconnect();
  }
}

simulateEmergency();
