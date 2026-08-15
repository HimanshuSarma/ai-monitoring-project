require('dotenv').config();

module.exports = {
  PORT: parseInt(process.env.PORT, 10) || 8000,
  NODE_ENV: process.env.NODE_ENV || 'development',
};