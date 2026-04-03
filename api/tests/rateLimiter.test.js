const rateLimiter = require('../src/middlewares/rateLimiter');
const config = require('../src/config');

describe('Rate Limiter Middleware', () => {
  let req, res, next;

  beforeEach(() => {
    rateLimiter.clearStore();
    req = {
      ip: '127.0.0.1',
      connection: { remoteAddress: '127.0.0.1' },
    };
    res = {
      status: jest.fn().mockReturnThis(),
      set: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };
    next = jest.fn();
  });

  test('should allow requests within limit', () => {
    // Call rate limiter multiple times (less than the limit)
    for (let i = 0; i < 10; i++) {
      rateLimiter(req, res, next);
    }

    expect(next).toHaveBeenCalledTimes(10);
    expect(res.status).not.toHaveBeenCalled();
  });

  test('should block requests exceeding limit', () => {
    const limit = config.rateLimitMaxRequests;

    // Exhaust the limit
    for (let i = 0; i < limit; i++) {
      rateLimiter(req, res, next);
    }

    // Reset mocks to check the next call
    jest.clearAllMocks();

    // This call should be blocked
    rateLimiter(req, res, next);

    expect(res.status).toHaveBeenCalledWith(429);
    expect(res.set).toHaveBeenCalledWith('Retry-After', expect.any(String));
    expect(next).not.toHaveBeenCalled();
  });

  test('should return correct Retry-After header', () => {
    const limit = config.rateLimitMaxRequests;

    // Exhaust the limit
    for (let i = 0; i < limit; i++) {
      rateLimiter(req, res, next);
    }

    jest.clearAllMocks();

    // Trigger rate limit
    rateLimiter(req, res, next);

    expect(res.set).toHaveBeenCalledWith('Retry-After', expect.stringMatching(/^\d+$/));
  });

  test('should allow different IPs independently', () => {
    const req1 = {
      ip: '192.168.1.1',
      connection: { remoteAddress: '192.168.1.1' },
    };
    const req2 = {
      ip: '192.168.1.2',
      connection: { remoteAddress: '192.168.1.2' },
    };

    const next1 = jest.fn();
    const next2 = jest.fn();

    const limit = config.rateLimitMaxRequests;

    // Exhaust limit for IP1
    for (let i = 0; i < limit; i++) {
      rateLimiter(req1, res, next1);
    }

    // IP2 should still have requests available
    rateLimiter(req2, res, next2);

    expect(next2).toHaveBeenCalled();
  });

  test('should reset after window expires', (done) => {
    const window = 100; // 100ms for testing
    const limit = 3;

    // Temporarily override config
    const originalWindow = config.rateLimitWindowMs;
    const originalLimit = config.rateLimitMaxRequests;
    config.rateLimitWindowMs = window;
    config.rateLimitMaxRequests = limit;
    rateLimiter.clearStore();

    // Make requests
    for (let i = 0; i < limit; i++) {
      rateLimiter(req, res, next);
    }

    jest.clearAllMocks();

    // Wait for window to expire
    setTimeout(() => {
      const newNext = jest.fn();
      rateLimiter(req, res, newNext);

      // Should be allowed after window expires
      expect(newNext).toHaveBeenCalled();

      // Restore config
      config.rateLimitWindowMs = originalWindow;
      config.rateLimitMaxRequests = originalLimit;
      rateLimiter.clearStore();

      done();
    }, window + 50);
  });
});
