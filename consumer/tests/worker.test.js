const { handleMessage } = require('../src/worker');
const { processActivity } = require('../src/services/activityProcessor');

jest.mock('../src/services/activityProcessor');

describe('Consumer Worker Message Handling', () => {
  let channel;
  let msg;

  beforeEach(() => {
    jest.clearAllMocks();
    channel = {
      ack: jest.fn(),
      nack: jest.fn(),
    };
    msg = {
      content: Buffer.from(
        JSON.stringify({
          id: 'activity-123',
          userId: '550e8400-e29b-41d4-a716-446655440000',
          eventType: 'user_login',
          timestamp: '2023-10-27T10:00:00Z',
          payload: { device: 'desktop' },
        })
      ),
    };
  });

  test('should ACK when message is parsed and processed successfully', async () => {
    processActivity.mockResolvedValueOnce({ id: 'activity-123' });

    await handleMessage(channel, msg);

    expect(processActivity).toHaveBeenCalledTimes(1);
    expect(channel.ack).toHaveBeenCalledWith(msg);
    expect(channel.nack).not.toHaveBeenCalled();
  });

  test('should NACK without requeue on JSON parse errors', async () => {
    const invalidMsg = { content: Buffer.from('{not-json}') };

    await handleMessage(channel, invalidMsg);

    expect(processActivity).not.toHaveBeenCalled();
    expect(channel.ack).not.toHaveBeenCalled();
    expect(channel.nack).toHaveBeenCalledWith(invalidMsg, false, false);
  });

  test('should NACK without requeue on non-retryable structure errors', async () => {
    processActivity.mockRejectedValueOnce(new Error('Invalid message structure: missing required fields'));

    await handleMessage(channel, msg);

    expect(channel.ack).not.toHaveBeenCalled();
    expect(channel.nack).toHaveBeenCalledWith(msg, false, false);
  });

  test('should NACK with requeue on transient processing errors', async () => {
    processActivity.mockRejectedValueOnce(new Error('Database timeout'));

    await handleMessage(channel, msg);

    expect(channel.ack).not.toHaveBeenCalled();
    expect(channel.nack).toHaveBeenCalledWith(msg, false, true);
  });
});
