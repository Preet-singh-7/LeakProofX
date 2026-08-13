const mongoose = require('mongoose');
const logger = require('../logs/logger');
const { env } = require('./env');

async function connectDb() {
  mongoose.set('strictQuery', true);
  await mongoose.connect(env.mongoUri);
  logger.info({ mongoUri: env.mongoUri.replace(/\/\/.*@/, '//***@') }, 'connected to MongoDB');
}

module.exports = { connectDb };
