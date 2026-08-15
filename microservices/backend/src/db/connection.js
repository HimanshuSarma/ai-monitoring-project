// prismaClient.js
const { PrismaClient } = require('@prisma/client');

// Use global variable in development to prevent multiple Prisma client instances
// during hot-reloads/server restarts.
const globalForPrisma = global;

const prisma = globalForPrisma.prisma || new PrismaClient({
  log: ['query', 'info', 'warn', 'error'],
});

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

module.exports = prisma;