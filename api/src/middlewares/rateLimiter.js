const config = require('../config');

// In-memory store for tracking requests per IP
const requestsMap = new Map();

/**
 * Sliding window counter implementation
 * Tracks request timestamps for each IP address
 */
const rateLimiterMiddleware = (req, res, next) => {
  const clientIp = req.ip || req.connection.remoteAddress || 'unknown';
  const now = Date.now();
  const windowStart = now - config.rateLimitWindowMs;

  // Initialize or get the list of request timestamps for this IP
  if (!requestsMap.has(clientIp)) {
    requestsMap.set(clientIp, []);
  }

  const timestamps = requestsMap.get(clientIp);

  // Remove timestamps outside the current window
  const validTimestamps = timestamps.filter((timestamp) => timestamp > windowStart);

  // Check if limit exceeded
  if (validTimestamps.length >= config.rateLimitMaxRequests) {
    // Calculate retry-after: time until oldest valid request exits the window
    const oldestTimestamp = validTimestamps[0];
    const retryAfter = Math.ceil((config.rateLimitWindowMs - (now - oldestTimestamp)) / 1000);

    return res.status(429).set('Retry-After', String(retryAfter)).json({
      error: 'Too Many Requests',
      message: `Rate limit exceeded. Max ${config.rateLimitMaxRequests} requests per ${config.rateLimitWindowMs / 1000} seconds.`,
      retryAfter,
    });
  }

  // Add current timestamp
  validTimestamps.push(now);
  requestsMap.set(clientIp, validTimestamps);

  // Cleanup: remove old entries from map to prevent memory leaks
  if (requestsMap.size > 10000) {
    const ips = Array.from(requestsMap.keys());
    for (const ip of ips.slice(0, 1000)) {
      requestsMap.delete(ip);
    }
  }

  next();
};

rateLimiterMiddleware.clearStore = () => {
  requestsMap.clear();
};

module.exports = rateLimiterMiddleware;
