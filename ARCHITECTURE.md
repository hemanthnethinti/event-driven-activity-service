# Architecture Documentation

## System Architecture Overview

This document details the architectural design of the Event-Driven User Activity Service, including component interactions, design patterns, and rationale.

## High-Level Architecture Diagram

```
┌──────────────────────────────────────────────────────────────────────┐
│                         Client Layer                                  │
│                  (Web Apps, Mobile, Services)                         │
└──────────────────────────────┬───────────────────────────────────────┘
                               │ HTTP/REST
                               │
┌──────────────────────────────▼───────────────────────────────────────┐
│                         API Gateway Layer                              │
│                        (Load Balancer)                                │
└──────────────────────────────┬───────────────────────────────────────┘
                               │
         ┌─────────────────────┼─────────────────────┐
         │                     │                     │
┌────────▼────────┐  ┌────────▼────────┐  ┌────────▼────────┐
│   API Service   │  │   API Service   │  │   API Service   │
│   (Instance 1)  │  │   (Instance 2)  │  │   (Instance N)  │
│  - Validation   │  │  - Validation   │  │  - Validation   │
│  - Rate Limit   │  │  - Rate Limit   │  │  - Rate Limit   │
│  - Publishing   │  │  - Publishing   │  │  - Publishing   │
└────────┬────────┘  └────────┬────────┘  └────────┬────────┘
         │                     │                     │
         └─────────────────────┼─────────────────────┘
                               │ AMQP
                ┌──────────────▼──────────────┐
                │    RabbitMQ Message Broker  │
                │  Queue: user_activities     │
                │  (Durable, Persistent)      │
                └──────────────┬──────────────┘
                               │
         ┌─────────────────────┼─────────────────────┐
         │                     │                     │
┌────────▼────────┐  ┌────────▼────────┐  ┌────────▼────────┐
│  Consumer       │  │  Consumer       │  │  Consumer       │
│  Worker 1       │  │  Worker 2       │  │  Worker N       │
│  - Parse Msg    │  │  - Parse Msg    │  │  - Parse Msg    │
│  - Process      │  │  - Process      │  │  - Process      │
│  - Persist      │  │  - Persist      │  │  - Persist      │
│  - ACK/NACK     │  │  - ACK/NACK     │  │  - ACK/NACK     │
└────────┬────────┘  └────────┬────────┘  └────────┬────────┘
         │                     │                     │
         └─────────────────────┼─────────────────────┘
                               │ TCP (MongoDB Protocol)
                ┌──────────────▼──────────────┐
                │    MongoDB Database         │
                │  Database: activity_db      │
                │  Collection: activities     │
                └─────────────────────────────┘
```

## Component Interactions

### 1. API Service

**Responsibility**: Ingest events, validate input, enforce rate limits, publish to message queue

**Key Components**:

- `server.js`: Express.js application setup and initialization
- `activityController.js`: Request handler for activity creation
- `activityRoutes.js`: Route definitions
- `rateLimiter.js`: IP-based rate limiting middleware
- `rabbitmqClient.js`: RabbitMQ publisher
- `validator.js`: Input validation logic
- `Activity.js`: Mongoose schema definition

**Flow**:

```
HTTP Request
    │
    ├─▶ Express Middleware (JSON parser)
    │
    ├─▶ Rate Limiter Middleware
    │   ├─ Check IP rate limit
    │   ├─ Track request timestamp
    │   └─ Return 429 if exceeded
    │
    ├─▶ Route Handler (activityController)
    │   ├─ Validate input (validator.js)
    │   ├─ Generate UUID for event
    │   ├─ Publish to RabbitMQ
    │   └─ Return 202 Accepted
    │
    └─▶ HTTP Response (202/400/429/503)
```

### 2. RabbitMQ Message Broker

**Responsibility**: Durably store and distribute messages between producers and consumers

**Configuration**:

- Queue: `user_activities`
- Type: Classic queue
- Durable: Yes (persists across restarts)
- Persistent messages: Yes (ACKed after successful processing)

**Message Format**:

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "userId": "user-123",
  "eventType": "user_login",
  "timestamp": "2023-10-27T10:00:00Z",
  "payload": {
    "ipAddress": "192.168.1.1",
    "device": "desktop"
  }
}
```

**Acknowledgment Strategy**:

- **ACK**: After successful database insert
- **NACK with requeue**: On processing errors
- **Prefetch**: 1 message per consumer (configurable)

### 3. Consumer Worker Service

**Responsibility**: Consume messages, process activities, persist to database, acknowledge messages

**Key Components**:

- `worker.js`: Main consumer loop
- `activityProcessor.js`: Message processing and persistence logic
- `Activity.js`: Mongoose schema (shared with API)
- `config.js`: Configuration management

**Flow**:

```
Consumer Starts
    │
    ├─▶ Connect to RabbitMQ
    │
    ├─▶ Connect to MongoDB
    │
    ├─▶ Set up message consumer
    │   └─ Wait for messages with prefetch count
    │
    ├─▶ Message Received
    │   ├─ Parse JSON
    │   ├─ Check for duplicates (idempotency)
    │   ├─ Validate message structure
    │   ├─ Insert into MongoDB
    │   ├─ ACK message on success
    │   └─ NACK on error (requeue for retry)
    │
    └─▶ Repeat (wait for next message)
```

### 4. MongoDB Database

**Responsibility**: Persistent storage of processed activity events

**Collection**: `activities`

**Schema**:

```javascript
{
  id: String (unique index),           // Event UUID
  userId: String (indexed),            // User identifier
  eventType: String (indexed),         // Type of event
  timestamp: Date (indexed),           // Original event time
  processedAt: Date (indexed),         // Processing timestamp
  payload: Mixed,                      // Flexible JSON data
  createdAt: Date,                     // MongoDB timestamp
  updatedAt: Date                      // MongoDB timestamp
}
```

**Indexes**:

- `id`: Unique index (prevents duplicates)
- `userId`: Regular index (queries by user)
- `eventType`: Regular index (queries by type)
- `timestamp`: Regular index (time-based queries)
- `processedAt`: Regular index (query processing lag)

## Design Patterns

### 1. Event-Driven Architecture

**Pattern**: Decoupled producer-consumer pattern using message queue

**Benefits**:

- **Scalability**: Add consumers independent of API
- **Resilience**: Consumer failure doesn't affect API
- **Asynchrony**: API returns immediately, processing happens async
- **Decoupling**: API and consumer don't communicate directly

**Trade-offs**:

- **Eventual Consistency**: Data not immediately available after API call
- **Complexity**: Additional services to maintain
- **Debugging**: Harder to trace requests across services

### 2. Rate Limiting (Sliding Window Counter)

**Algorithm**: Maintain list of request timestamps in a sliding window

**Implementation**:

```
Window = 60 seconds
Max Requests = 50

Request Timeline:
Time (s):  0    10    20    30    40    50    60    70    80
Req Count: [████████████████████████████] = 50 (within window = OK)
           [█████████████████████████████] = 51 (exceeds = BLOCKED)

At t=70:   [████████████████████████████] = 50 (oldest req at t=0 expired)
Next req:  [█████████████████████████████] = 51 (BLOCKED still)

Wait until t=61 to have ≤50 requests in window
```

**Advantages**:

- Precise limiting
- Fair to users
- No coordination needed between API instances (in-memory)

**Disadvantages**:

- Memory usage grows with number of IPs
- Doesn't work across multiple machines (needs Redis for production)
- Not cluster-aware

### 3. Idempotency

**Pattern**: Unique event IDs prevent duplicate processing

**Implementation**:

```
1. API generates UUID for each event
2. Consumer checks if ID exists before processing
3. If found: skip processing, return existing document
4. Prevents duplicate database inserts from message requeues
```

**Benefits**:

- Safe message reprocessing
- Handles network retries gracefully
- Prevents data duplication

### 4. Health Checks

**Pattern**: Liveness and readiness probes for container orchestration

**Implementation**:

- **API**: `/health` endpoint returns 200 OK
- **RabbitMQ**: `rabbitmq-diagnostics ping`
- **MongoDB**: `db.runCommand({ ping: 1 })`
- **Consumer**: Auto-restarts on failure

**Benefits**:

- Docker Compose waits for healthy dependencies
- Kubernetes can manage pod lifecycle
- Load balancers route only to healthy services

## Data Flow Sequence

```
1. Client sends POST /api/v1/activities
   └─▶ { userId, eventType, timestamp, payload }

2. API Service:
   ├─ Check rate limit (IP-based)
   ├─ Validate input
   ├─ Generate UUID for event
   ├─ Publish to RabbitMQ
   └─▶ Return 202 Accepted

3. RabbitMQ:
   ├─ Persist message to disk
   ├─ Store in queue
   └─▶ Message available for consumers

4. Consumer Service:
   ├─ Fetch message from queue
   ├─ Parse JSON
   ├─ Validate message structure
   ├─ Check for duplicates (idempotency)
   ├─ Insert into MongoDB
   ├─ Acknowledge message
   └─▶ Message removed from queue

5. MongoDB:
   ├─ Store activity document
   ├─ Update indexes
   └─▶ Data queryable
```

## Error Handling Strategy

### API Service Errors

| Error                | Status | Action                  | Retry?     |
| -------------------- | ------ | ----------------------- | ---------- |
| Invalid input        | 400    | Return error details    | No         |
| Rate limit exceeded  | 429    | Return with Retry-After | Yes        |
| RabbitMQ unavailable | 503    | Return error            | Yes        |
| Database error       | 500    | Log error               | No (async) |

### Consumer Errors

| Error             | Action       | Requeue? | Retry? |
| ----------------- | ------------ | -------- | ------ |
| JSON parse error  | Log and NACK | No       | No     |
| Invalid structure | Log and NACK | No       | No     |
| Database error    | NACK         | Yes      | Yes    |
| Network timeout   | NACK         | Yes      | Yes    |

## Scalability Considerations

### Horizontal Scaling

**Multiple API Instances**:

- Each instance independently enforces rate limits
- Rate limits are per-IP, not per-instance
- Problem: Distributed rate limiting needs coordination (Redis)

**Multiple Consumer Instances**:

- RabbitMQ automatically distributes messages
- Prefetch count determines parallel processing
- Each consumer processes one message at a time (configurable)

**Example Setup**:

```
docker-compose scale api=3 consumer=5
```

### Vertical Scaling

**API Performance**:

- Bottleneck: Rate limiter memory usage
- Solution: Implement TTL-based cleanup (already done)
- Monitor: Memory usage and request latency

**Consumer Performance**:

- Bottleneck: Database write speed
- Solution: Increase `MESSAGE_CONSUMER_CONCURRENCY`
- Monitor: Queue depth and processing lag

**Database Performance**:

- Bottleneck: Index updates during inserts
- Solution: Shard by userId or timestamp
- Monitor: Query performance and disk I/O

## Security Architecture

### Authentication & Authorization

**Current**: None (open API)

**Production Recommendations**:

- API Keys: Simple, suitable for internal services
- OAuth 2.0: For user-facing applications
- mTLS: For service-to-service communication

### Data Security

- **In Transit**:
  - Use HTTPS/TLS for API
  - Use RabbitMQ over TLS
  - Use MongoDB connection string with SSL

- **At Rest**:
  - MongoDB encryption (Atlas feature)
  - Encrypted volumes for persistent storage

- **Credentials**:
  - Environment variables (not hardcoded)
  - Secrets management (AWS Secrets Manager, HashiCorp Vault)

### Input Validation

- Type checking (string, date format)
- Length limits (prevent large payloads)
- Payload structure validation (required fields)

### Rate Limiting

- Prevents brute force attacks
- Mitigates DDoS
- Protects backend resources

## Monitoring & Observability

### Key Metrics

**API Service**:

- Request rate and latency
- Rate limit hits (429 responses)
- Error rates by status code
- RabbitMQ publish failures

**Consumer Service**:

- Message consumption rate
- Processing latency
- Error rates (parse, DB, network)
- Queue depth and lag

**RabbitMQ**:

- Queue length
- Publish/consume rates
- Connection count
- Message acknowledgment rates

**MongoDB**:

- Document insertion rate
- Query latency
- Index performance
- Disk usage

### Logging Strategy

```
[timestamp] [service] [level] [context] message

Example:
[2023-10-27T10:00:00.123Z] [API] [INFO] [activityController] Activity saved: uuid-123
[2023-10-27T10:00:00.456Z] [RabbitMQ] [ERROR] [publisher] Connection failed
[2023-10-27T10:00:00.789Z] [Consumer] [INFO] [processor] Message acknowledged
```

## Technology Decisions

### Why Express.js?

- Lightweight and fast
- Large ecosystem
- Good for microservices
- Familiar to most Node.js developers

### Why MongoDB?

- Flexible document schema
- No migrations needed
- Good for event data (JSON-like)
- Horizontal scaling with sharding

### Why RabbitMQ?

- Durable message queue
- Message persistence
- Good reliability guarantees
- Wide industry adoption

### Why Node.js?

- Non-blocking I/O
- Good for I/O-bound operations
- Easy to run async operations
- Single language for entire stack

## Deployment Architecture

### Docker Compose (Development/Testing)

```yaml
Services:
  - RabbitMQ: Single instance with management UI
  - MongoDB: Single instance with volume mount
  - API: Single or multiple instances
  - Consumer: Single or multiple instances

Network: Isolated bridge network
Volumes: Named volumes for data persistence
```

### Kubernetes (Production)

**Recommended Configuration**:

```yaml
Deployments:
  - api: 3 pod replicas, rolling updates
  - consumer: 5 pod replicas, rolling updates
  - rabbitmq: StatefulSet with persistent volume
  - mongodb: StatefulSet with persistent volume

Services:
  - api: ClusterIP + NodePort/Ingress
  - rabbitmq: ClusterIP
  - mongodb: ClusterIP

Probes:
  - Liveness: Detects hung services
  - Readiness: Routes traffic only to ready pods
  - Startup: Allows slow services to initialize
```

## Testing Strategy

### Unit Tests

- Input validators
- Rate limiter logic
- Activity processor
- Database operations

### Integration Tests

- API → RabbitMQ → Consumer → MongoDB
- Rate limiting with concurrent requests
- Message acknowledgment and requeue
- Error scenarios and retries

### Load Tests

- Throughput: 1000+ events/second
- Latency: API response <100ms
- Memory: Rate limiter with 10k+ IPs
- Queue: Handle burst of 10k+ messages

## Future Enhancements

1. **Distributed Rate Limiting**: Use Redis for cluster-aware rate limiting
2. **Dead Letter Queue**: Route failed messages to DLQ for manual inspection
3. **Message Retry Policy**: Exponential backoff for transient failures
4. **Event Versioning**: Support multiple event schema versions
5. **Activity Analytics**: Aggregations and reporting queries
6. **Message Encryption**: Encrypt sensitive data in transit
7. **Circuit Breaker**: Fail gracefully when downstream services are down
8. **Distributed Tracing**: Trace requests across services (OpenTelemetry)

## Conclusion

This architecture balances simplicity with scalability, providing a solid foundation for an event-driven activity tracking system. The loose coupling between API and consumers enables independent scaling and maintenance, while the durable message queue ensures reliability and data integrity.
