require('dotenv').config();
const axios = require('axios');
const prisma = require('./db/connection');

// Polling Interval: 20 seconds (20,000 ms)
const POLL_INTERVAL_MS = 5000;
let isProcessing = false;
let isRunning = true;

/**
 * Helper to call Hugging Face Serverless API
 */
async function analyzeErrorWithLLM(log) {
  const url = `https://router.huggingface.co/v1/chat/completions`;

  try {
    const response = await axios.post(
      url,
      {
        model: process.env.HF_MODEL,
        messages: [
          {
            role: "system",
            content: "You are an SRE expert. Provide a 2-sentence summary of the root cause and a direct fix for this error."
          },
          {
            role: "user",
            content: `Service: ${log.service}\nMessage: ${log.message}`
          }
        ],
        max_tokens: 200,
        temperature: 0.1
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.HF_API_KEY}`,
          'Content-Type': 'application/json'
        },
        timeout: 30000
      }
    );

    console.log(' [Hugging Face API Response]:', response.data);

    return response.data.choices[0].message.content.trim();
  } catch (err) {
    console.error(' [Hugging Face API Error]:', err.response?.data || err.message);
    throw err;
  }
}

/**
 * 1. Process a single unprocessed error log
 */
async function processNextErrorLog() {
  if (isProcessing || !isRunning) return;

  isProcessing = true;

  try {
    // Determine which model to access (prisma.errorLog or prisma.error_log)
    const errorModel = prisma.errorLog || prisma.error_log;

    // Fetch the newest unprocessed error log
    const logToProcess = await errorModel.findFirst({
      where: { isProcessed: false },
      orderBy: { createdAt: 'desc' } // Process newest errors first
    });

    if (!logToProcess) {
      console.log(`[${new Date().toISOString()}] No unprocessed logs found. Waiting for next cycle...`);
      return;
    }

    console.log(`\n==================================================`);
    console.log(`[${new Date().toISOString()}] Picked up log for processing:`);
    console.log(` ID:      ${logToProcess.id}`);
    console.log(` Service: ${logToProcess.service}`);
    console.log(` Message: ${logToProcess.message}`);
    console.log(`==================================================`);

    const aiAnalysisResult = await analyzeErrorWithLLM(logToProcess);

    // Simulate network delay to AI Agent
    await new Promise((resolve) => setTimeout(resolve, 1500));

    console.log('\n--- LLM Response Received ---');
    console.log(aiAnalysisResult);
    console.log('-----------------------------\n');

    // -------------------------------------------------------------------------
    // Step 3 -> Mutate record state in MongoDB via Prisma
    // -------------------------------------------------------------------------
    const updatedLog = await errorModel.update({
      where: { id: logToProcess.id },
      data: {
        isProcessed: true,
        aiAnalysis: aiAnalysisResult
      }
    });

    console.log(` Successfully processed and updated log ID: ${updatedLog.id}`);

  } catch (error) {
    console.error(` Error processing log cycle:`, error.message);
  } finally {
    isProcessing = false;
  }
}

/**
 * 2. Recursive Polling Loop (Prevents overlapping executions)
 */
async function startPollingLoop() {
  console.log(` 🚀 Error Dispatcher worker started.`);
  console.log(` Polling MongoDB every ${POLL_INTERVAL_MS / 1000} seconds...\n`);

  const loop = async () => {
    if (!isRunning) return;

    await processNextErrorLog();

    // Schedule next run after completion
    if (isRunning) {
      setTimeout(loop, POLL_INTERVAL_MS);
    }
  };

  // Start initial run immediately
  loop();
}

/**
 * 3. Graceful Shutdown Handler (Essential for Docker & Kubernetes)
 */
async function gracefulShutdown(signal) {
  console.log(`\n Received ${signal}. Shutting down Error Dispatcher gracefully...`);
  isRunning = false;

  // Wait for any active processing to complete
  let checkCount = 0;
  while (isProcessing && checkCount < 10) {
    console.log(' Waiting for active log processing to complete...');
    await new Promise((r) => setTimeout(r, 1000));
    checkCount++;
  }

  await prisma.$disconnect();
  console.log(' Disconnected from MongoDB. Exiting.');
  process.exit(0);
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Start Worker
startPollingLoop();