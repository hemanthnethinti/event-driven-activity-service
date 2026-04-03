require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const config = require('./config');
const activityRoutes = require('./routes/activityRoutes');
const { connectRabbitMQ, closeConnection } = require('./utils/rabbitmqClient');

const app = express();

// Middleware
app.use(express.json());

// Request logging
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// Health check endpoint
app.get('/health', (req, res) => {
  return res.status(200).json({
    status: 'OK',
    timestamp: new Date().toISOString(),
  });
});

// API routes
app.use('/api/v1', activityRoutes);

// 404 handler
app.use((req, res) => {
  return res.status(404).json({
    error: 'Not Found',
    message: `Route ${req.method} ${req.path} not found`,
  });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('[Error]', err);
  return res.status(500).json({
    error: 'Internal Server Error',
    message: 'An unexpected error occurred',
  });
});

// Initialize application
const initializeApp = async () => {
  try {
    // Connect to MongoDB
    console.log('[MongoDB] Connecting to:', config.databaseUrl.split('@')[1] || 'localhost');
    await mongoose.connect(config.databaseUrl, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('[MongoDB] Connected successfully');

    // Connect to RabbitMQ
    await connectRabbitMQ();

    // Start server
    const server = app.listen(config.apiPort, () => {
      console.log(`[Express] API server running on port ${config.apiPort}`);
    });

    // Graceful shutdown
    const shutdown = async (signal) => {
      console.log(`\n[${signal}] Received, shutting down gracefully...`);
      server.close(async () => {
        try {
          await closeConnection();
          await mongoose.connection.close();
          console.log('[Shutdown] All connections closed');
          process.exit(0);
        } catch (error) {
          console.error('[Shutdown] Error during graceful shutdown:', error);
          process.exit(1);
        }
      });
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
  } catch (error) {
    console.error('[Fatal Error] Failed to initialize application:', error.message);
    process.exit(1);
  }
};

if (require.main === module) {
  initializeApp();
}

app.initializeApp = initializeApp;
module.exports = app;
