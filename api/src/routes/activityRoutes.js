const express = require('express');
const { createActivity } = require('../controllers/activityController');
const rateLimiter = require('../middlewares/rateLimiter');

const router = express.Router();

// Apply rate limiter to all activity routes
router.use(rateLimiter);

// POST endpoint for creating activities
router.post('/activities', createActivity);

module.exports = router;
