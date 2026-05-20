import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';

// 1. Read your Supabase URL
const connectionString = process.env.DATABASE_URL;

// 2. Create a TypeScript interface for the global scope
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

// 3. Create the connection only if it doesn't already exist
const createPrismaClient = () => {
  const pool = new Pool({ connectionString });
  const adapter = new PrismaPg(pool);
  return new PrismaClient({ adapter });
};

// 4. Export the client (reuses the existing one in dev mode)
export const prisma = globalForPrisma.prisma ?? createPrismaClient();

// 5. Save it to the global scope in development to survive Hot Reloads
if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

export * from '@prisma/client';