module.exports = {
  nodeEnv: process.env.NODE_ENV || 'development',
  apiPort: process.env.API_PORT || 3000,
  rabbitmqUrl: process.env.RABBITMQ_URL || 'amqp://guest:guest@localhost:5672',
  databaseUrl:
    process.env.DATABASE_URL ||
    'mongodb://user:password@localhost:27017/activity_db?authSource=admin',
  rateLimitWindowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000'),
  rateLimitMaxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '50'),
};
