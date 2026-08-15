require('dotenv').config();

module.exports = {
  NODE_ENV: process.env.NODE_ENV || 'development',
  DATABASE_URL: process.env.DATABASE_URL,
  AI_AGENT_URL: process.env.AI_AGENT_URL || 'http://localhost:11434/api/generate',
  AI_MODEL: process.env.AI_MODEL || 'qwen2.5:1.5b',
  POLL_INTERVAL_MS: parseInt(process.env.POLL_INTERVAL_MS, 10) || 5000,
  METRICS_PORT: parseInt(process.env.METRICS_PORT, 10) || 8000,
};