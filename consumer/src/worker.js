require('dotenv').config();
const amqp = require('amqplib');
const mongoose = require('mongoose');
const config = require('./config');
const { processActivity } = require('./services/activityProcessor');

let connection = null;
let channel = null;

const isNonRetryableProcessingError = (error) => {
  if (!error || !error.message) {
    return false;
  }

  return /Invalid message structure/i.test(error.message);
};

const handleMessage = async (ch, msg) => {
  if (!msg) {
    return;
  }

  let messageId = 'unknown';

  try {
    const content = msg.content.toString();
    const messageObject = JSON.parse(content);
    messageId = messageObject && messageObject.id ? messageObject.id : 'unknown';

    console.log(`[Consumer] Processing message: ${messageId}`);

    await processActivity(messageObject);

    ch.ack(msg);
    console.log(`[Consumer] Message acknowledged: ${messageId}`);
  } catch (error) {
    console.error(`[Consumer] Error processing message ${messageId}:`, error.message);

    // Malformed or structurally invalid messages should not be requeued.
    const shouldRequeue = !isNonRetryableProcessingError(error) && !(error instanceof SyntaxError);
    ch.nack(msg, false, shouldRequeue);

    if (shouldRequeue) {
      console.log(`[Consumer] Message ${messageId} nacked and requeued for retry`);
    } else {
      console.log(`[Consumer] Message ${messageId} nacked without requeue`);
    }
  }
};

const connectRabbitMQ = async () => {
  try {
    connection = await amqp.connect(config.rabbitmqUrl);
    channel = await connection.createChannel();

    // Assert queue (must match API service)
    await channel.assertQueue('user_activities', { durable: true });

    console.log('[RabbitMQ] Consumer connected successfully');

    // Set prefetch count for concurrent message processing
    await channel.prefetch(config.messageConsumerConcurrency);

    return channel;
  } catch (error) {
    console.error('[RabbitMQ] Connection failed:', error.message);
    throw error;
  }
};

const startConsumer = async () => {
  try {
    // Connect to MongoDB
    console.log('[MongoDB] Connecting...');
    await mongoose.connect(config.databaseUrl, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('[MongoDB] Connected successfully');

    // Connect to RabbitMQ
    const ch = await connectRabbitMQ();

    // Setup message consumer
    await ch.consume('user_activities', async (msg) => {
      await handleMessage(ch, msg);
    });

    console.log('[Consumer] Waiting for messages...');

    // Graceful shutdown
    const shutdown = async (signal) => {
      console.log(`\n[${signal}] Received, shutting down gracefully...`);
      try {
        if (channel) await channel.close();
        if (connection) await connection.close();
        await mongoose.connection.close();
        console.log('[Shutdown] All connections closed');
        process.exit(0);
      } catch (error) {
        console.error('[Shutdown] Error during graceful shutdown:', error);
        process.exit(1);
      }
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
  } catch (error) {
    console.error('[Fatal Error] Failed to start consumer:', error.message);
    process.exit(1);
  }
};

if (require.main === module) {
  startConsumer();
}

module.exports = {
  startConsumer,
  handleMessage,
  isNonRetryableProcessingError,
};
