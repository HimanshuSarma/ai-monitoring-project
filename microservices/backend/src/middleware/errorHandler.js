const { saveErrorToDb } = require('../services/logService');

async function errorHandler(err, req, res, next) {
  const statusCode = err.statusCode || 500;
  const errorMessage = err.message || 'Internal Server Error';

  try {
    await saveErrorToDb(errorMessage, {
      path: req.path,
      method: req.method,
      statusCode: statusCode.toString(),
    });
  } catch (dbErr) {
    // Prevent DB logging failure from crashing error middleware
  }

  res.status(statusCode).json({
    success: false,
    error: errorMessage,
  });
}

module.exports = errorHandler;