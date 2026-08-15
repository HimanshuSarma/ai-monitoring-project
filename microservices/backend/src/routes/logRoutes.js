const express = require('express');
const router = express.Router();
const logController = require('../controllers/logController');
const { asyncHandler } = require('../middleware/utils');

router.get('/logs/unprocessed', asyncHandler(logController.fetchUnprocessedLogs));
router.patch('/logs/:id/process', asyncHandler(logController.updateLogStatus));

module.exports = router;