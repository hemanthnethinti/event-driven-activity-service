const { processActivity } = require('../src/services/activityProcessor');
const Activity = require('../src/models/Activity');

// Mock Mongoose model
jest.mock('../src/models/Activity');

describe('Activity Processor', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('should process valid activity message', async () => {
    const message = {
      id: 'activity-123',
      userId: 'user-456',
      eventType: 'user_login',
      timestamp: '2023-10-27T10:00:00Z',
      payload: { device: 'mobile' },
    };

    const mockSavedActivity = { ...message, _id: 'mongodb-id' };
    Activity.findOne.mockResolvedValueOnce(null);
    Activity.mockImplementationOnce(() => ({
      save: jest.fn().mockResolvedValueOnce(mockSavedActivity),
    }));

    const result = await processActivity(message);

    expect(Activity.findOne).toHaveBeenCalledWith({ id: message.id });
    expect(result).toBeDefined();
  });

  test('should handle duplicate activity', async () => {
    const message = {
      id: 'activity-123',
      userId: 'user-456',
      eventType: 'user_login',
      timestamp: '2023-10-27T10:00:00Z',
      payload: { device: 'mobile' },
    };

    const existingActivity = { ...message, _id: 'mongodb-id' };
    Activity.findOne.mockResolvedValueOnce(existingActivity);

    const result = await processActivity(message);

    expect(result).toEqual(existingActivity);
    expect(Activity).not.toHaveBeenCalled();
  });

  test('should reject message with missing id', async () => {
    const message = {
      userId: 'user-456',
      eventType: 'user_login',
      timestamp: '2023-10-27T10:00:00Z',
      payload: { device: 'mobile' },
    };

    await expect(processActivity(message)).rejects.toThrow(/Invalid message structure/);
  });

  test('should reject message with missing userId', async () => {
    const message = {
      id: 'activity-123',
      eventType: 'user_login',
      timestamp: '2023-10-27T10:00:00Z',
      payload: { device: 'mobile' },
    };

    await expect(processActivity(message)).rejects.toThrow(/Invalid message structure/);
  });

  test('should reject message with missing eventType', async () => {
    const message = {
      id: 'activity-123',
      userId: 'user-456',
      timestamp: '2023-10-27T10:00:00Z',
      payload: { device: 'mobile' },
    };

    await expect(processActivity(message)).rejects.toThrow(/Invalid message structure/);
  });

  test('should reject message with missing timestamp', async () => {
    const message = {
      id: 'activity-123',
      userId: 'user-456',
      eventType: 'user_login',
      payload: { device: 'mobile' },
    };

    await expect(processActivity(message)).rejects.toThrow(/Invalid message structure/);
  });

  test('should handle database errors', async () => {
    const message = {
      id: 'activity-123',
      userId: 'user-456',
      eventType: 'user_login',
      timestamp: '2023-10-27T10:00:00Z',
      payload: { device: 'mobile' },
    };

    Activity.findOne.mockRejectedValueOnce(new Error('Database error'));

    await expect(processActivity(message)).rejects.toThrow('Database error');
  });
});
