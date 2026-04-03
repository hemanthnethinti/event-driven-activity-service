const Activity = require('../models/Activity');

/**
 * Process an activity message from RabbitMQ
 * @param {Object} message - The activity message object
 * @returns {Promise<Object>} - The saved activity document
 */
const processActivity = async (message) => {
  try {
    // Validate message structure
    if (!message.id || !message.userId || !message.eventType || !message.timestamp) {
      throw new Error('Invalid message structure: missing required fields');
    }

    // Check if activity with this ID already exists (idempotency)
    const existingActivity = await Activity.findOne({ id: message.id });
    if (existingActivity) {
      console.log(`[Processor] Activity ${message.id} already processed, skipping`);
      return existingActivity;
    }

    // Create and save activity
    const activity = new Activity({
      id: message.id,
      userId: message.userId,
      eventType: message.eventType,
      timestamp: new Date(message.timestamp),
      payload: message.payload || {},
      processedAt: new Date(),
    });

    const savedActivity = await activity.save();
    console.log(`[Processor] Activity saved: ${message.id}`);

    return savedActivity;
  } catch (error) {
    console.error(`[Processor] Error processing activity:`, error.message);
    throw error;
  }
};

module.exports = {
  processActivity,
};
