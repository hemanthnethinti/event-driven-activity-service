module.exports = {
  nodeEnv: process.env.NODE_ENV || 'development',
  rabbitmqUrl: process.env.RABBITMQ_URL || 'amqp://guest:guest@localhost:5672',
  databaseUrl:
    process.env.DATABASE_URL ||
    'mongodb://user:password@localhost:27017/activity_db?authSource=admin',
  messageConsumerConcurrency: parseInt(process.env.MESSAGE_CONSUMER_CONCURRENCY || '1'),
};
