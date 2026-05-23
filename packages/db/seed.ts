import { prisma } from './index';
import bcrypt from 'bcryptjs';

// We spin up a direct local connection specifically for the seed script
async function main() {
  console.log('🌱 Starting database seed...');

  const adminEmail = 'admin@ruhuna.lk';
  
  // 1. Check if the admin already exists
  const existingAdmin = await prisma.user.findUnique({
    where: { email: adminEmail },
  });

  if (existingAdmin) {
    console.log(`✅ Admin account (${adminEmail}) already exists. Skipping...`);
    return;
  }

  // 2. Hash the default password
  const salt = await bcrypt.genSalt(10);
  const password_hash = await bcrypt.hash('supersecurepassword', salt);

  // 3. Create the Master Admin
  const admin = await prisma.user.create({
    data: {
      email: adminEmail,
      name: 'System Administrator',
      password_hash: password_hash,
      role: 'ADMIN',
      status: 'VERIFIED',          // <-- REQUIRED FOR NEW LOGIN FLOW
      is_profile_complete: true,   // <-- REQUIRED TO BYPASS ONBOARDING
    },
  });

  console.log(`🎉 Master Admin created successfully!`);
  console.log(`ID: ${admin.id}`);
  console.log(`Email: ${admin.email}`);
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error('❌ Seeding failed:');
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });