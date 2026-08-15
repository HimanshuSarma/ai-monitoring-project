const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const { asyncHandler } = require('../middleware/utils');

router.get('/users/:id', asyncHandler(userController.getUserById));

module.exports = router;