import prisma from './db/connection.js';
import { startMetricsServer } from './services/metricsService.js';
import { startEventWatcher } from './watcher.js';

async function main() {
  const metricsServer = await startMetricsServer();
  await startEventWatcher();

  const gracefulShutdown = async (signal) => {
    console.log(`Received ${signal}. Shutting down...`);

    metricsServer.close(() => {
      console.log('Metrics server closed.');
    });

    await prisma.$disconnect();
    console.log('Database connection closed.');

    process.exit(0);
  };

  process.on('SIGINT', () => gracefulShutdown('SIGINT'));
  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
}

main().catch((err) => {
  console.error('Fatal watcher error:', err);
  process.exit(1);
});