const request = require('supertest');
const app = require('../src/server');
const { publishMessage } = require('../src/utils/rabbitmqClient');
const { validateActivityPayload } = require('../src/utils/validator');

// Mock RabbitMQ
jest.mock('../src/utils/rabbitmqClient');

describe('POST /api/v1/activities', () => {
  const validPayload = {
    userId: '550e8400-e29b-41d4-a716-446655440000',
    eventType: 'user_login',
    timestamp: '2023-10-27T10:00:00Z',
    payload: {
      ipAddress: '192.168.1.1',
      device: 'desktop',
      browser: 'Chrome',
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    publishMessage.mockResolvedValue(true);
  });

  test('should accept valid activity and return 202', async () => {
    const response = await request(app)
      .post('/api/v1/activities')
      .send(validPayload);

    expect(response.status).toBe(202);
    expect(response.body).toHaveProperty('message');
    expect(response.body).toHaveProperty('activityId');
    expect(publishMessage).toHaveBeenCalled();
  });

  test('should return 400 for missing userId', async () => {
    const invalidPayload = { ...validPayload };
    delete invalidPayload.userId;

    const response = await request(app).post('/api/v1/activities').send(invalidPayload);

    expect(response.status).toBe(400);
    expect(response.body).toHaveProperty('error', 'Bad Request');
    expect(response.body.details).toEqual(expect.arrayContaining([expect.stringContaining('userId')]));
  });

  test('should return 400 for missing eventType', async () => {
    const invalidPayload = { ...validPayload };
    delete invalidPayload.eventType;

    const response = await request(app).post('/api/v1/activities').send(invalidPayload);

    expect(response.status).toBe(400);
    expect(response.body).toHaveProperty('error', 'Bad Request');
  });

  test('should return 400 for missing timestamp', async () => {
    const invalidPayload = { ...validPayload };
    delete invalidPayload.timestamp;

    const response = await request(app).post('/api/v1/activities').send(invalidPayload);

    expect(response.status).toBe(400);
    expect(response.body).toHaveProperty('error', 'Bad Request');
  });

  test('should return 400 for invalid timestamp', async () => {
    const invalidPayload = {
      ...validPayload,
      timestamp: 'not-a-valid-date',
    };

    const response = await request(app).post('/api/v1/activities').send(invalidPayload);

    expect(response.status).toBe(400);
    expect(response.body.details).toEqual(expect.arrayContaining([expect.stringContaining('timestamp')]));
  });

  test('should return 400 for empty eventType', async () => {
    const invalidPayload = {
      ...validPayload,
      eventType: '   ',
    };

    const response = await request(app).post('/api/v1/activities').send(invalidPayload);

    expect(response.status).toBe(400);
    expect(response.body.details).toEqual(expect.arrayContaining([expect.stringContaining('eventType')]));
  });

  test('should return 400 when payload field is missing', async () => {
    const payloadWithoutPayload = { ...validPayload };
    delete payloadWithoutPayload.payload;

    const response = await request(app)
      .post('/api/v1/activities')
      .send(payloadWithoutPayload);

    expect(response.status).toBe(400);
    expect(response.body.details).toEqual(expect.arrayContaining([expect.stringContaining('payload')]));
  });

  test('should return 503 when RabbitMQ publish fails', async () => {
    publishMessage.mockRejectedValueOnce(new Error('RabbitMQ connection failed'));

    const response = await request(app)
      .post('/api/v1/activities')
      .send(validPayload);

    expect(response.status).toBe(503);
    expect(response.body).toHaveProperty('error', 'Service Unavailable');
  });
});

describe('GET /health', () => {
  test('should return 200 status', async () => {
    const response = await request(app).get('/health');
    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('status', 'OK');
  });
});

describe('Validation Tests', () => {
  test('validateActivityPayload should accept valid payload', () => {
    const payload = {
      userId: '550e8400-e29b-41d4-a716-446655440000',
      eventType: 'user_login',
      timestamp: '2023-10-27T10:00:00Z',
      payload: { test: true },
    };

    const result = validateActivityPayload(payload);
    expect(result.isValid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  test('validateActivityPayload should reject invalid timestamp', () => {
    const payload = {
      userId: '550e8400-e29b-41d4-a716-446655440000',
      eventType: 'user_login',
      timestamp: 'invalid',
      payload: { test: true },
    };

    const result = validateActivityPayload(payload);
    expect(result.isValid).toBe(false);
    expect(result.errors).toEqual(expect.arrayContaining([expect.stringContaining('timestamp')]));
  });
});
