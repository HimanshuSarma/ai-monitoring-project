const axios = require('axios');
const config = require('../config/env');

/**
 * Calls the AI agent to analyze an error log.
 * Implements retry logic for cold starts and transient network issues.
 * 
 * @param {Object} log - The error log record
 * @returns {Promise<string>} AI analysis summary
 */
async function analyzeErrorWithLLM(log) {
  const maxRetries = 6;
  const retryDelayMs = 5000;

  const payload = {
    model: config.AI_MODEL,
    prompt: `You are an SRE expert. Provide a 2-sentence summary of the root cause and a direct fix for this error:\nService: ${log.service}\nMessage: ${log.message}`,
    stream: false,
  };

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`[Attempt ${attempt}/${maxRetries}] Calling Qwen LLM Engine...`);

      const response = await axios.post(config.AI_AGENT_URL, payload, {
        headers: { 'Content-Type': 'application/json' },
        timeout: 30000, // 30s timeout for token generation
      });

      return response.data.response;
    } catch (err) {
      const isNetworkError =
        err.code === 'ECONNREFUSED' ||
        err.code === 'ENOTFOUND' ||
        err.response?.status === 503;

      if (isNetworkError && attempt < maxRetries) {
        console.warn(
          `[Cold Start] LLM engine not ready (${err.message}). Retrying in ${retryDelayMs / 1000}s...`
        );
        await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
      } else {
        throw new Error(`LLM Analysis Failed: ${err.message}`);
      }
    }
  }
}

module.exports = { analyzeErrorWithLLM };