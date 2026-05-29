import 'dotenv/config';
import { prisma } from './index';
import bcrypt from 'bcryptjs';

// We spin up a direct local connection specifically for the seed script
async function main() {
  console.log('🌱 Starting database seed...');

  // Pull credentials strictly from the environment
  const adminEmail = process.env.DEFAULT_ADMIN_EMAIL;
  const adminPassword = process.env.DEFAULT_ADMIN_PASSWORD;

  // Strict Gatekeeper: No fallbacks allowed. 
  // If they aren't in the .env file, the script dies immediately.
  if (!adminEmail || !adminPassword) {
    throw new Error(
      '❌ FATAL: Missing DEFAULT_ADMIN_EMAIL or DEFAULT_ADMIN_PASSWORD in environment variables. Seeding aborted.'
    );
  }

  // 1. Check if the admin already exists
  const existingAdmin = await prisma.user.findUnique({
    where: { email: adminEmail },
  });

  if (existingAdmin) {
    console.log(`✅ Admin account (${adminEmail}) already exists. Skipping...`);
    return;
  }

  // 2. Hash the securely injected password
  const salt = await bcrypt.genSalt(10);
  const password_hash = await bcrypt.hash(adminPassword, salt);

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