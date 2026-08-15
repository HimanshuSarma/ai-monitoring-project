const prisma = require('./db/connection');
const config = require('./config/env');
const { analyzeErrorWithLLM } = require('./services/llmService');

let isProcessing = false;
let isRunning = true;

const errorModel = prisma.errorLog || prisma.error_log;

async function processNextErrorLog() {
  if (isProcessing || !isRunning) return;

  isProcessing = true;

  try {
    const logToProcess = await errorModel.findFirst({
      where: { isProcessed: false },
      orderBy: { createdAt: 'desc' },
    });

    if (!logToProcess) {
      return;
    }

    console.log(`Processing log ID: ${logToProcess.id} (${logToProcess.service})`);

    const aiAnalysisResult = await analyzeErrorWithLLM(logToProcess);

    const updatedLog = await errorModel.update({
      where: { id: logToProcess.id },
      data: {
        isProcessed: true,
        aiAnalysis: aiAnalysisResult,
      },
    });

    console.log(`Successfully processed log ID: ${updatedLog.id}`);
  } catch (error) {
    console.error(`Error in processing cycle:`, error.message);
  } finally {
    isProcessing = false;
  }
}

function startWorker() {
  console.log(`Error Dispatcher worker started.`);

  const loop = async () => {
    if (!isRunning) return;
    await processNextErrorLog();
    if (isRunning) {
      setTimeout(loop, config.POLL_INTERVAL_MS);
    }
  };

  loop();
}

async function stopWorker() {
  isRunning = false;
  let checkCount = 0;
  while (isProcessing && checkCount < 10) {
    console.log('Waiting for active log processing to complete...');
    await new Promise((resolve) => setTimeout(resolve, 1000));
    checkCount++;
  }
}

module.exports = { startWorker, stopWorker };