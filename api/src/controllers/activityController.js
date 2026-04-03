const { v4: uuidv4 } = require('uuid');
const { validateActivityPayload } = require('../utils/validator');
const { publishMessage } = require('../utils/rabbitmqClient');

const createActivity = async (req, res) => {
  try {
    // Validate input
    const validation = validateActivityPayload(req.body);

    if (!validation.isValid) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Invalid input payload',
        details: validation.errors,
      });
    }

    const { userId, eventType, timestamp, payload } = req.body;

    // Create activity object with unique ID
    const activity = {
      id: uuidv4(),
      userId,
      eventType,
      timestamp,
      payload,
    };

    // Publish to RabbitMQ
    try {
      await publishMessage(activity);
    } catch (error) {
      console.error('Failed to publish message:', error);
      return res.status(503).json({
        error: 'Service Unavailable',
        message: 'Failed to queue activity event',
      });
    }

    // Return 202 Accepted
    return res.status(202).json({
      message: 'Activity event accepted for processing',
      activityId: activity.id,
    });
  } catch (error) {
    console.error('Error in createActivity:', error);
    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'An unexpected error occurred',
    });
  }
};

module.exports = {
  createActivity,
};
