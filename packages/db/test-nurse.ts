import 'dotenv/config';
import { prisma } from './index';

async function test() {
  try {
    const email = 'test-nurse-' + Date.now() + '@medcenter.lk';
    const name = 'Test Nurse';
    const nic = '990000000X';
    const role = 'NURSE';
    const university_staff_id = 'STAFF-' + Date.now();
    const license_number = 'LIC-' + Date.now();

    console.log('Inserting nurse into database...');
    const newUser = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email,
          name,
          role,
          nic,
          status: 'UNVERIFIED',
          is_profile_complete: false,
        }
      });

      const staff = await tx.medicalCenterStaff.create({
        data: {
          staff_id: user.id,
          license_number: license_number,
          university_staff_id: university_staff_id,
        }
      });

      await tx.nurse.create({
        data: {
          nurse_id: staff.staff_id
        }
      });

      return user;
    });

    console.log('✅ Nurse inserted successfully: ID =', newUser.id);
  } catch (err) {
    console.error('❌ Insertion failed:');
    console.error(err);
  } finally {
    await prisma.$disconnect();
  }
}

test();
