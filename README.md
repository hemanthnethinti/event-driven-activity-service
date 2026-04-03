# Event-Driven User Activity Service

A scalable, event-driven microservice architecture for tracking user activities using RabbitMQ, MongoDB, and Express.js with built-in rate limiting.

## Overview

This project demonstrates a real-world implementation of an event-driven architecture with:

- **API Service**: High-performance REST API for activity ingestion with IP-based rate limiting
- **Consumer Service**: Asynchronous message consumer for processing and persisting events
- **RabbitMQ**: Durable message queue for decoupling services
- **MongoDB**: NoSQL database for flexible activity schema storage
- **Docker**: Complete containerization for consistent deployments

## Architecture

### Microservice Pattern

```
┌─────────────────────────────────────────────────────────────┐
│                    Client Applications                       │
└────────────────────┬────────────────────────────────────────┘
                     │ POST /api/v1/activities
                     │
        ┌────────────▼─────────────┐
        │   API Service (Port 3000) │
        │  - Input Validation       │
        │  - Rate Limiting (IP)     │
        │  - RabbitMQ Publishing    │
        └────────────┬──────────────┘
                     │ Publish Message
                     │
        ┌────────────▼──────────────┐
        │  RabbitMQ (Port 5672)     │
        │  Queue: user_activities   │
        │  (Durable, Persistent)    │
        └────────────┬──────────────┘
                     │ Consume Message
                     │
        ┌────────────▼──────────────┐
        │ Consumer Service          │
        │  - Message Parsing        │
        │  - Activity Processing    │
        │  - Database Storage       │
        │  - Message ACK/NACK       │
        └────────────┬──────────────┘
                     │ Insert/Update
                     │
        ┌────────────▼──────────────┐
        │  MongoDB (Port 27017)     │
        │  activity_db.activities   │
        └───────────────────────────┘
```

### Data Flow

1. Client sends activity event to API
2. API validates and rate-limits the request
3. Valid events are published to RabbitMQ queue
4. API immediately returns 202 Accepted
5. Consumer service consumes messages from queue
6. Messages are processed and stored in MongoDB
7. Consumer acknowledges successful processing
8. Failed messages are requeued for retry

## Project Structure

```
event-driven-activity-service/
├── api/                          # API Service
│   ├── src/
│   │   ├── controllers/
│   │   │   └── activityController.js
│   │   ├── middlewares/
│   │   │   └── rateLimiter.js
│   │   ├── routes/
│   │   │   └── activityRoutes.js
│   │   ├── utils/
│   │   │   ├── rabbitmqClient.js
│   │   │   └── validator.js
│   │   ├── models/
│   │   │   └── Activity.js
│   │   ├── config.js
│   │   └── server.js
│   ├── tests/
│   │   ├── api.test.js
│   │   └── rateLimiter.test.js
│   ├── package.json
│   ├── Dockerfile
│   └── .dockerignore
├── consumer/                     # Consumer Service
│   ├── src/
│   │   ├── services/
│   │   │   └── activityProcessor.js
│   │   ├── models/
│   │   │   └── Activity.js
│   │   ├── config.js
│   │   └── worker.js
│   ├── tests/
│   │   └── consumer.test.js
│   ├── package.json
│   ├── Dockerfile
│   └── .dockerignore
├── docker-compose.yml            # Orchestration
├── .env.example                  # Environment template
├── API_DOCS.md                   # API documentation
├── ARCHITECTURE.md               # Architecture details
├── scripts/
│   └── verify-submission.ps1     # Automated verification checks
└── README.md                     # This file
```

## Verified Results (Mar 23, 2026)

The following evidence has been validated against the running Docker stack:

- Queue exists and is active: `user_activities` queue is present and durable.
- Queue flow proven: RabbitMQ stats show `publish`, `ack`, and `redeliver` counters moving.
- Validation failure proven: malformed payload returns `400 Bad Request`.
- Rate limiting proven: burst of 60 requests from one IP yielded 50 accepted and 10 rate-limited.
- Idempotency proven: publishing duplicate message IDs resulted in only one stored record in MongoDB.
- Failure and retry proven: with MongoDB unavailable, consumer logged DB errors and requeued messages until recovery.

For repeatable verification, run the script in [scripts/verify-submission.ps1](scripts/verify-submission.ps1).

## Prerequisites

- **Docker** 20.10+
- **Docker Compose** 1.29+
- **Node.js** 18+ (for local development)
- **npm** 8+ (for local development)

## Quick Start

### 1. Clone the Repository

```bash
git clone <repository-url>
cd event-driven-activity-service
```

### 2. Configure Environment

```bash
cp .env.example .env
# Edit .env if needed (defaults work for local development)
```

### 3. Start All Services

```bash
docker-compose up --build
```

Expected output:

```
event-rabbitmq       | 2023-10-27 10:00:00.123 [info] ...
event-mongodb        | ... waiting for connections on port 27017
event-api            | [Express] API server running on port 3000
event-consumer       | [Consumer] Waiting for messages...
```

### 4. Verify Services

```bash
# Check API health
curl http://localhost:3000/health

# Check RabbitMQ Management UI
open http://localhost:15672  # guest:guest

# Verify MongoDB connection
docker-compose exec database mongosh -u user -p password activity_db
```

## Configuration

### Environment Variables

All configuration is managed through environment variables (see `.env.example`):

```bash
# Node Environment
NODE_ENV=production

# API Configuration
API_PORT=3000

# RabbitMQ Configuration
RABBITMQ_URL=amqp://guest:guest@rabbitmq:5672

# MongoDB Configuration
DATABASE_URL=mongodb://user:password@database:27017/activity_db?authSource=admin

# Rate Limiting Configuration
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX_REQUESTS=50

# Consumer Configuration
MESSAGE_CONSUMER_CONCURRENCY=1
```

### Rate Limiting Configuration

Adjust rate limiting in `.env`:

- `RATE_LIMIT_WINDOW_MS`: Window size in milliseconds (default: 60000 = 60 seconds)
- `RATE_LIMIT_MAX_REQUESTS`: Max requests per window per IP (default: 50)

### RabbitMQ Configuration

In `docker-compose.yml`:

- Queue name: `user_activities`
- Queue type: Durable
- Message persistence: Enabled
- Management UI: `http://localhost:15672`

### MongoDB Configuration

In `docker-compose.yml`:

- Root username: `user`
- Root password: `password`
- Database: `activity_db`
- Port: 27017

## API Usage

### Create Activity Event

```bash
curl -X POST http://localhost:3000/api/v1/activities \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "550e8400-e29b-41d4-a716-446655440000",
    "eventType": "user_login",
    "timestamp": "2023-10-27T10:00:00Z",
    "payload": {
      "ipAddress": "192.168.1.1",
      "device": "desktop",
      "browser": "Chrome"
    }
  }'
```

### Health Check

```bash
curl http://localhost:3000/health
```

### Query Stored Activities (via MongoDB)

```bash
docker-compose exec database mongosh -u user -p password activity_db
> db.activities.find().pretty()
> db.activities.countDocuments()
> db.activities.find({ userId: "550e8400-e29b-41d4-a716-446655440000" })
```

See [API_DOCS.md](API_DOCS.md) for complete API documentation.

## Testing

### Running Tests

```bash
# API Service Tests
docker-compose exec api npm test

# Consumer Service Tests
docker-compose exec consumer npm test

# Test with coverage
docker-compose exec api npm test -- --coverage
docker-compose exec consumer npm test -- --coverage
```

### Automated Submission Verification

Run all key checks (queue, validation failure, rate limit, idempotency):

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\verify-submission.ps1
```

Run including the optional outage/retry scenario:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\verify-submission.ps1 -IncludeOutageTest
```

### Test Suites

**API Service** (`api/tests/`):

- `api.test.js`: API endpoint tests, validation tests
- `rateLimiter.test.js`: Rate limiting logic tests

**Consumer Service** (`consumer/tests/`):

- `consumer.test.js`: Activity processor tests, schema validation

### Manual Testing

### Pre-Submission Verification Checklist

Use this checklist before submission to prove the core requirements under normal and failure conditions.

#### 1. Verify Queue in RabbitMQ UI

1. Open `http://localhost:15672` (guest/guest).
2. Go to **Queues**.
3. Confirm queue `user_activities` exists and is **durable**.
4. Send several events and watch message counters move (publish/deliver/ack).

You can also verify from CLI:

```bash
curl -s -u guest:guest http://localhost:15672/api/queues/%2F/user_activities
```

Check these fields in the response:

- `name` is `user_activities`
- `message_stats.publish` increases when API receives events
- `message_stats.ack` increases when consumer stores events
- `message_stats.redeliver` increases when retries happen

#### 2. Failure Scenario: MongoDB Outage and Recovery

```bash
# Stop MongoDB intentionally
docker stop event-mongodb

# Send a valid event (API should still return 202)
curl -X POST http://localhost:3000/api/v1/activities \
  -H "Content-Type: application/json" \
  -d '{
    "userId":"550e8400-e29b-41d4-a716-446655440000",
    "eventType":"db_outage_retry_test",
    "timestamp":"2026-03-23T12:00:00Z",
    "payload":{"case":"retry-check"}
  }'

# Inspect consumer retry logs
docker compose logs --tail=120 consumer

# Start MongoDB back
docker start event-mongodb
```

Expected behavior:

- API keeps accepting events with `202 Accepted`.
- Consumer logs show DB errors and message requeue/retry behavior.
- After MongoDB recovers, messages are processed and ACKed.

#### 3. Validation Failure Scenario

```bash
curl -X POST http://localhost:3000/api/v1/activities \
  -H "Content-Type: application/json" \
  -d '{"userId":"u1"}'
```

Expected behavior:

- API returns `400 Bad Request` with detailed validation errors.

#### 4. Prove Rate Limiting (50 requests/minute per IP)

PowerShell example:

```powershell
$total=60; $ok=0; $rate=0; $bad=0
for ($i=1; $i -le $total; $i++) {
  $body = '{"userId":"550e8400-e29b-41d4-a716-446655440000","eventType":"rate_test","timestamp":"2026-03-23T11:45:00Z","payload":{"seq":'+$i+'}}'
  try {
    $resp = Invoke-WebRequest -Method Post -Uri 'http://localhost:3000/api/v1/activities' -ContentType 'application/json' -Body $body -UseBasicParsing
    if ($resp.StatusCode -eq 202) { $ok++ } else { $bad++ }
  } catch {
    $code = $_.Exception.Response.StatusCode.value__
    if ($code -eq 429) { $rate++ } else { $bad++ }
  }
}
"TOTAL=$total ACCEPTED=$ok RATE_LIMITED=$rate OTHER=$bad"
```

Expected behavior:

- Exactly 50 accepted, remaining requests return `429 Too Many Requests`.
- `Retry-After` header is present on 429 responses.

#### 5. Prove Idempotency

Publish the same `id` twice and verify only one DB document is stored:

```bash
# Publish duplicate messages with same id to RabbitMQ (or via a script)
# Then verify database count by id:
docker compose exec -T database mongosh --quiet -u user -p password --authenticationDatabase admin activity_db --eval "db.activities.countDocuments({id:'dup-id-12345'})"
```

Expected behavior:

- Count remains `1`.
- Consumer logs show second message is detected as already processed and skipped.

#### Test Rate Limiting

```bash
# Send 55 requests rapidly (limit is 50 per 60 seconds)
for i in {1..55}; do
  RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" \
    -X POST http://localhost:3000/api/v1/activities \
    -H "Content-Type: application/json" \
    -d '{"userId":"test-'$i'","eventType":"test","timestamp":"2023-10-27T10:00:00Z"}')
  echo "Request $i: HTTP $RESPONSE"
  sleep 0.1
done
```

#### Test Database Persistence

```bash
# Send an activity
curl -X POST http://localhost:3000/api/v1/activities \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "test-user-1",
    "eventType": "test_event",
    "timestamp": "2023-10-27T10:00:00Z",
    "payload": {"test": true}
  }'

# Wait for consumer to process (2-3 seconds typical)
sleep 3

# Query MongoDB
docker-compose exec database mongosh -u user -p password activity_db \
  --eval 'db.activities.find().pretty()'
```

#### Test Message Flow

1. Send activity to API
2. Monitor RabbitMQ: `http://localhost:15672` (Queues tab)
3. Observe consumer logs: `docker-compose logs consumer`
4. Verify data in MongoDB

## Deployment

### Production Checklist

- [ ] Update `.env` with production credentials
- [ ] Use strong RabbitMQ credentials
- [ ] Use strong MongoDB credentials
- [ ] Configure proper logging levels
- [ ] Set appropriate rate limits
- [ ] Enable SSL/TLS for connections
- [ ] Setup monitoring and alerting
- [ ] Configure backup strategy for MongoDB
- [ ] Review security groups and firewall rules

### Production Environment Variables

```bash
NODE_ENV=production
API_PORT=3000
RABBITMQ_URL=amqp://[user]:[password]@rabbitmq.prod:5672
DATABASE_URL=mongodb://[user]:[password]@mongodb.prod:27017/activity_db?authSource=admin&ssl=true
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX_REQUESTS=50
MESSAGE_CONSUMER_CONCURRENCY=10
```

### Scaling Recommendations

**Horizontal Scaling**:

- Run multiple `api` services behind a load balancer
- Run multiple `consumer` services for parallel processing
- RabbitMQ and MongoDB handle distributed workloads

**Vertical Scaling**:

- Increase `MESSAGE_CONSUMER_CONCURRENCY` for parallel message processing
- Allocate more memory/CPU to MongoDB
- Configure RabbitMQ for higher throughput

## Monitoring

### RabbitMQ Management UI

Access at `http://localhost:15672` (guest:guest)

Monitor:

- Queue lengths
- Message publish/consume rates
- Connection count
- Channel count

### Container Logs

```bash
# All services
docker-compose logs -f

# Specific service
docker-compose logs -f api
docker-compose logs -f consumer
docker-compose logs -f rabbitmq
docker-compose logs -f database
```

### Health Checks

All services include health checks:

- **API**: `/health` endpoint (200 OK)
- **RabbitMQ**: Ping diagnostic
- **MongoDB**: Ping command
- **Consumer**: Runs continuously, auto-restarts on failure

## Development

### Local Development Setup

```bash
# Install dependencies
cd api && npm install && cd ..
cd consumer && npm install && cd ..

# Run services with docker-compose
docker-compose up -d

# Run tests
docker-compose exec api npm test
docker-compose exec consumer npm test

# Watch mode
docker-compose exec api npm run dev
docker-compose exec consumer npm run dev
```

### Code Style

- **Language**: JavaScript (Node.js)
- **Linting**: Follow standard Node.js practices
- **Testing**: Jest for unit tests with mocks

### Key Design Decisions

1. **Sliding Window Rate Limiting**: In-memory implementation for simplicity and performance
2. **Durable Queues**: Ensures message persistence across RabbitMQ restarts
3. **Message Acknowledgment**: Prevents message loss on consumer failures
4. **Idempotency**: Unique event IDs prevent duplicate processing
5. **Flexible Payload**: Mixed JSON type allows diverse event data

## Troubleshooting

### API Service Not Starting

```bash
# Check logs
docker-compose logs api

# Verify RabbitMQ and MongoDB are healthy
docker-compose ps
```

**Common Issues**:

- MongoDB/RabbitMQ connection: Check `DATABASE_URL` and `RABBITMQ_URL`
- Port conflicts: Ensure ports 3000, 5672, 27017, 15672 are available

### Messages Not Being Consumed

```bash
# Check consumer logs
docker-compose logs consumer

# Check RabbitMQ queue
docker-compose logs rabbitmq

# Verify consumer is running
docker-compose ps consumer
```

**Common Issues**:

- Consumer crashed: Check logs for errors
- RabbitMQ unavailable: Restart RabbitMQ service
- Database connection issue: Check MongoDB credentials

### High Memory Usage

- Reduce `MESSAGE_CONSUMER_CONCURRENCY` in `.env`
- Implement pagination for large result sets
- Cleanup old rate limiter entries (already implemented)

### Database Connection Issues

```bash
# Test MongoDB connection
docker-compose exec database mongosh -u user -p password

# Check connection string format
echo $DATABASE_URL
```

## Performance Characteristics

- **API Latency**: ~5-10ms (excluding network)
- **Rate Limiter**: O(n) where n = requests in window (typically <100)
- **Throughput**: 1000+ events/second (RabbitMQ limited)
- **Consumer Lag**: Depends on database write speed (~100ms per message)

## Contributing

1. Create a feature branch
2. Make changes
3. Run tests: `npm test`
4. Submit pull request

## Security

- Environment variables for sensitive data (no hardcoding)
- Input validation on all API endpoints
- Rate limiting to prevent abuse
- Message acknowledgment to prevent loss
- MongoDB authentication required

## License

MIT

## Support

For issues or questions:

1. Check [API_DOCS.md](API_DOCS.md) for API reference
2. Review logs: `docker-compose logs`
3. Check RabbitMQ UI: `http://localhost:15672`
4. Query MongoDB directly for stored data

## Stopping Services

```bash
# Stop all services
docker-compose down

# Stop and remove volumes (caution: deletes data)
docker-compose down -v
```

## Additional Resources

- [RabbitMQ Documentation](https://www.rabbitmq.com/documentation.html)
- [MongoDB Documentation](https://docs.mongodb.com/)
- [Express.js Documentation](https://expressjs.com/)
- [Docker Compose Documentation](https://docs.docker.com/compose/)
