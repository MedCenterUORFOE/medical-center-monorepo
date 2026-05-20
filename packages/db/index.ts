import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';

// 1. Read your Supabase URL from the environment
const connectionString = process.env.DATABASE_URL;

// 2. Create a standard PostgreSQL connection pool
const pool = new Pool({ connectionString });

// 3. Wrap the pool in Prisma's driver adapter
const adapter = new PrismaPg(pool);

// 4. Pass the adapter into Prisma 7
export const prisma = new PrismaClient({ adapter });

export * from '@prisma/client';