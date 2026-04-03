const amqp = require('amqplib');
const config = require('../config');

let connection = null;
let channel = null;

const connectRabbitMQ = async () => {
  try {
    if (connection) {
      return channel;
    }

    connection = await amqp.connect(config.rabbitmqUrl);
    channel = await connection.createChannel();

    // Assert the queue (durable)
    await channel.assertQueue('user_activities', { durable: true });

    console.log('[RabbitMQ] Connected successfully');

    // Handle connection errors
    connection.on('error', (err) => {
      console.error('[RabbitMQ] Connection error:', err);
      connection = null;
      channel = null;
    });

    return channel;
  } catch (error) {
    console.error('[RabbitMQ] Connection failed:', error.message);
    throw error;
  }
};

const publishMessage = async (message) => {
  try {
    const ch = await connectRabbitMQ();
    const messageBuffer = Buffer.from(JSON.stringify(message));

    ch.sendToQueue('user_activities', messageBuffer, {
      persistent: true,
      contentType: 'application/json',
    });

    console.log('[RabbitMQ] Message published:', message.userId);
    return true;
  } catch (error) {
    console.error('[RabbitMQ] Failed to publish message:', error.message);
    throw error;
  }
};

const closeConnection = async () => {
  try {
    if (channel) await channel.close();
    if (connection) await connection.close();
    connection = null;
    channel = null;
    console.log('[RabbitMQ] Connection closed');
  } catch (error) {
    console.error('[RabbitMQ] Error closing connection:', error.message);
  }
};

module.exports = {
  connectRabbitMQ,
  publishMessage,
  closeConnection,
};
