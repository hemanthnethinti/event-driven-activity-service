# Event-Driven Activity Service

A learning project: tracking user activities via an asynchronous message queue. API publishes events to RabbitMQ, a consumer worker processes them and stores in MongoDB.

**Why this project**: To understand how decoupling services with a message queue changes API response times and failure handling compared to synchronous write-then-respond.

## What's Here

- **api/**: Express server that validates and publishes activity events
- **consumer/**: Worker that processes queued events and stores them in MongoDB
- **RabbitMQ**: Message broker that buffers events (survives restarts)
- **MongoDB**: Stores events with flexible schema
- **Docker**: All services run in containers via docker-compose

The API doesn't talk directly to MongoDB. It publishes to RabbitMQ and returns 202 immediately. The consumer handles actual database writes asynchronously.

## Architecture

```
Client
  │
  ├─→ POST /api/v1/activities (with validation + rate limit)
  │
  API Service
  │
  ├─→ Publish to RabbitMQ → Return 202 Accepted (done)
  │
  RabbitMQ (queue: user_activities)
  │
  Consumer Worker (reads from queue)
  │
  ├─→ Store in MongoDB
  ├─→ ACK message (remove from queue)
  │
  MongoDB
```

## Why RabbitMQ?

The synchronous approach would be: API writes to DB, returns 200. But database writes are slow and can fail. If Mongo is down, all requests fail.

With RabbitMQ:

- API returns 202 immediately (queue is fast, Mongo connection issues don't block)
- Consumer processes async (retry on failure, can handle Mongo outages)
- If consumer crashes, messages stay in queue
- Decoupling means you can scale services independently

**Tradeoff**: Eventually consistent. Between API call and store, there's a gap (usually <1s, but could be longer if consumer is slow).

## How It Works

1. **Client sends event** → `POST /api/v1/activities`
2. **API validates** → Check required fields, format
3. **Rate limiter** → Track requests per IP (50/min default), reject if exceeded
4. **Publish to queue** → Message goes to RabbitMQ, waits for consumer
5. **Return 202** → Client gets "accepted" immediately
6. **Consumer processes** → Reads message, saves to MongoDB, ACKs
7. **If consumer fails** → Message requeued, stays in queue until success

## Getting Started

### Requirements

- Docker + Docker Compose (just need these)
- Node.js 18+ (for local testing only)

### Start Everything

```bash
docker-compose up --build
```

Services start:

- API: `http://localhost:3000`
- RabbitMQ UI: `http://localhost:15672` (guest/guest)
- MongoDB: `mongodb://user:password@localhost:27017/activity_db`

Check API is alive:

```bash
curl http://localhost:3000/health
```

### Send an Event

```bash
curl -X POST http://localhost:3000/api/v1/activities \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "user-123",
    "eventType": "login",
    "timestamp": "2026-05-22T10:00:00Z",
    "payload": {"ip": "192.168.1.1", "browser": "Chrome"}
  }'
```

Returns `202 Accepted` immediately. Event goes to queue, consumer processes it.

Wait ~1 second, then verify in MongoDB:

```bash
docker-compose exec database mongosh -u user -p password activity_db \
  --eval 'db.activities.findOne()'
```

## Failure Handling

What actually happens when things break:

**Consumer crashes while processing**:

- Message stays in queue (not ACKed)
- After timeout, RabbitMQ requeues it
- Consumer restarts or another consumer picks it up

**MongoDB is down**:

- API still returns 202 (queue is independent)
- Consumer logs error, doesn't ACK
- Message stays in queue
- When MongoDB recovers, consumer retries and ACKs

**Rate limit exceeded**:

- API returns `429 Too Many Requests`
- Requests from that IP are rejected for 60 seconds
- Tracked in memory (resets if API restarts)

**Invalid request**:

- API returns `400 Bad Request` with validation error
- Never published to queue

## Known Limitations

- **Rate limiter is in-memory**: Resets on API restart. With multiple API instances, each tracks separately (not shared).
- **No request deduplication**: If same request sent twice, both go to queue. Consumer has idempotency logic (event ID) to prevent duplicate DB records.
- **Single consumer**: Processes messages one at a time. Can be parallelized but wasn't for this project.
- **No message TTL**: Messages stay in queue indefinitely if consumer can't process them (no "give up after N days").
- **All services must be up**: Even though they're decoupled, you need RabbitMQ + MongoDB running together.
- **Simple schema**: No migrations. If event schema changes, old messages might not parse correctly.

## Testing

Unit tests mock RabbitMQ and MongoDB:

```bash
docker-compose exec api npm test
docker-compose exec consumer npm test
```

Manual verification (prove queue works):

1. Open RabbitMQ UI: `http://localhost:15672`
2. Go to **Queues** → `user_activities`
3. Send event via API
4. Watch message count increase then decrease as consumer processes

Test rate limiting (send 60 requests from same IP):

```powershell
for ($i=1; $i -le 60; $i++) {
  $resp = curl.exe -s -o /dev/null -w "%{http_code}" `
    -X POST http://localhost:3000/api/v1/activities `
    -H "Content-Type: application/json" `
    -d '{"userId":"user-'$i'","eventType":"test","timestamp":"2026-05-22T10:00:00Z"}'
  Write-Host "Request $i: $resp"
}
```

Should see: 50 accepted (202), rest rate-limited (429).

Test consumer failure recovery:

```bash
docker-compose stop database
# Send event - API returns 202, message queued
curl -X POST http://localhost:3000/api/v1/activities \
  -H "Content-Type: application/json" \
  -d '{"userId":"test","eventType":"fail_test","timestamp":"2026-05-22T10:00:00Z"}'

docker-compose logs consumer  # See DB errors, message not ACKed

docker-compose start database
docker-compose logs consumer  # See retry and successful ACK
```

## Code Layout

```
api/
├── src/
│   ├── server.js              # Express app
│   ├── controllers/           # Request handlers
│   ├── middlewares/           # Rate limiter
│   ├── routes/                # Route definitions
│   ├── utils/                 # RabbitMQ client, validator
│   └── models/                # Activity schema

consumer/
├── src/
│   ├── worker.js              # Main worker loop
│   ├── services/              # Message processor, DB write
│   └── models/                # Activity schema

tests/                          # Jest specs (mocked deps)
```

## Environment Variables

Copy `.env.example` to `.env`. Defaults work for local dev:

```
NODE_ENV=development
API_PORT=3000
RABBITMQ_URL=amqp://guest:guest@rabbitmq:5672
DATABASE_URL=mongodb://user:password@database:27017/activity_db?authSource=admin
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX_REQUESTS=50
```

## Future Improvements

These would make sense for a real system:

- **Persistent rate limiter**: Move IP tracking to Redis instead of memory (survives restarts, shared across API instances)
- **Multiple consumers**: Process messages in parallel instead of one-at-a-time
- **Dead letter queue**: Messages that fail N times go to a separate queue for investigation
- **Message TTL**: Drop messages if they're in queue too long (stale data)
- **Schema versioning**: Handle events with different payload structures
- **Metrics/monitoring**: Log queue depth, consumer lag, error rates
- **Request signing**: Verify API requests came from trusted sources

## See Also

[API_DOCS.md](API_DOCS.md) — endpoint reference
[ARCHITECTURE.md](ARCHITECTURE.md) — detailed flow diagrams
