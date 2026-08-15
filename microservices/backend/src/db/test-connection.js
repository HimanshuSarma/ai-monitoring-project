// test-connection.js
require('dotenv').config();
const prisma = require('./connection');

async function testConnection() {
  try {
    console.log('Connecting to MongoDB Atlas...');
    await prisma.$connect();
    console.log(' Successfully connected to MongoDB Atlas!');

    // Test creating a sample ErrorLog document
    const testLog = await prisma.error_log.create({
      data: {
        service: 'express-test-service',
        message: 'Connection test error',
        path: '/test',
        method: 'GET',
        statusCode: 500,
      },
    });

    console.log(' Inserted Test Document ID:', testLog.id);

  } catch (error) {
    console.error(' Failed to connect or operate on MongoDB Atlas:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

testConnection();