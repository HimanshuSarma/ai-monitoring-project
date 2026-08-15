const prisma = require('../db/connection');

const errorModel = prisma.errorLog || prisma.error_log;

async function saveErrorToDb(errorMessage, metadata = {}) {
  return await errorModel.create({
    data: {
      service: 'nodejs-express-app',
      message: errorMessage,
      path: metadata.path || null,
      method: metadata.method || null,
      statusCode: metadata.statusCode ? parseInt(metadata.statusCode, 10) : 500,
      isProcessed: false,
      aiAnalysis: null,
    },
  });
}

async function getUnprocessedErrors() {
  return await errorModel.findMany({
    where: { isProcessed: false },
    orderBy: { createdAt: 'desc' },
    take: 10,
  });
}

async function markLogAsProcessed(id, aiAnalysis) {
  return await errorModel.update({
    where: { id },
    data: {
      isProcessed: true,
      aiAnalysis: aiAnalysis || 'AI Agent processed and resolved issue.',
    },
  });
}

module.exports = {
  saveErrorToDb,
  getUnprocessedErrors,
  markLogAsProcessed,
};