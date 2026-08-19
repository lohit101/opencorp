import { PrismaClient } from '@prisma/client';

// Prisma client singleton to avoid exhausting database connections
// during development hot-reloads.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}