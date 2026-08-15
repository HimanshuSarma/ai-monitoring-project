const prisma = require('./db/connection');
const { startMetricsServer } = require('./services/metricsService');
const { startWorker, stopWorker } = require('./worker');

async function main() {
  const metricsServer = await startMetricsServer();

  startWorker();

  const gracefulShutdown = async (signal) => {
    console.log(`Received ${signal}. Shutting down gracefully...`);

    await stopWorker();

    metricsServer.close(() => {
      console.log('Metrics server closed.');
    });

    await prisma.$disconnect();
    console.log('Database connection closed.');

    process.exit(0);
  };

  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));
}

main().catch((err) => {
  console.error('Fatal startup error:', err);
  process.exit(1);
});