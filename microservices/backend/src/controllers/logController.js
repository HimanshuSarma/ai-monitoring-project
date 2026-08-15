const logService = require('../services/logService');

async function fetchUnprocessedLogs(req, res) {
  const pendingLogs = await logService.getUnprocessedErrors();
  res.json({ success: true, count: pendingLogs.length, data: pendingLogs });
}

async function updateLogStatus(req, res) {
  const { id } = req.params;
  const { aiAnalysis } = req.body;

  const updatedLog = await logService.markLogAsProcessed(id, aiAnalysis);
  res.json({ success: true, message: 'Log marked as processed', data: updatedLog });
}

module.exports = {
  fetchUnprocessedLogs,
  updateLogStatus,
};