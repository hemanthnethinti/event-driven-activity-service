# API Documentation

## Overview

The Event-Driven User Activity Service provides a REST API for ingesting user activity events into a distributed system. Events are published to RabbitMQ for asynchronous processing while rate limiting protects the API from abuse.

## Base URL

```
http://localhost:3000/api/v1
```

## Authentication

Currently, no authentication is required. In a production environment, consider implementing API keys or OAuth 2.0.

## Rate Limiting

- **Limit**: 50 requests per 60 seconds per IP address
- **Sliding Window Algorithm**: Tracks request timestamps in a rolling window
- **Response Code**: 429 Too Many Requests when exceeded
- **Retry-After Header**: Indicates seconds until the limit resets

### Rate Limit Response Example

```
HTTP/1.1 429 Too Many Requests
Retry-After: 45

{
  "error": "Too Many Requests",
  "message": "Rate limit exceeded. Max 50 requests per 60 seconds.",
  "retryAfter": 45
}
```

## Endpoints

### 1. Create Activity Event

**Endpoint**: `POST /activities`

**Description**: Ingest a user activity event for asynchronous processing.

**Request Headers**:

```
Content-Type: application/json
```

**Request Body**:

```json
{
  "userId": "550e8400-e29b-41d4-a716-446655440000",
  "eventType": "user_login",
  "timestamp": "2023-10-27T10:00:00Z",
  "payload": {
    "ipAddress": "192.168.1.1",
    "device": "desktop",
    "browser": "Chrome"
  }
}
```

**Request Body Schema**:

| Field     | Type              | Required | Description                                                                           |
| --------- | ----------------- | -------- | ------------------------------------------------------------------------------------- |
| userId    | String (UUID)     | Yes      | Unique identifier for the user. Should be a valid UUID.                               |
| eventType | String            | Yes      | Type of activity event (e.g., user_login, user_logout, page_view). Must be non-empty. |
| timestamp | String (ISO-8601) | Yes      | ISO-8601 formatted timestamp of when the event occurred (e.g., 2023-10-27T10:00:00Z). |
| payload   | Object (JSON)     | No       | Additional event-specific data. Can contain any valid JSON object.                    |

**Success Response**:

```
HTTP/1.1 202 Accepted
Content-Type: application/json

{
  "message": "Activity event accepted for processing",
  "activityId": "f7b3c2a1-5e8b-4f3a-9c7d-2e5a8b3c1f6d"
}
```

**Error Responses**:

#### 400 Bad Request - Invalid Input

```
HTTP/1.1 400 Bad Request
Content-Type: application/json

{
  "error": "Bad Request",
  "message": "Invalid input payload",
  "details": [
    "userId is required",
    "timestamp must be a valid ISO-8601 string"
  ]
}
```

**Common Validation Errors**:

- `userId is required` - userId field is missing
- `userId must be a string` - userId is not a string type
- `eventType is required` - eventType field is missing
- `eventType must be a string` - eventType is not a string type
- `eventType cannot be empty` - eventType is an empty or whitespace-only string
- `timestamp is required` - timestamp field is missing
- `timestamp must be a string` - timestamp is not a string type
- `timestamp must be a valid ISO-8601 string` - timestamp format is invalid
- `payload must be a JSON object` - payload is not a valid JSON object

#### 429 Too Many Requests - Rate Limit Exceeded

```
HTTP/1.1 429 Too Many Requests
Retry-After: 30
Content-Type: application/json

{
  "error": "Too Many Requests",
  "message": "Rate limit exceeded. Max 50 requests per 60 seconds.",
  "retryAfter": 30
}
```

#### 503 Service Unavailable - RabbitMQ Error

```
HTTP/1.1 503 Service Unavailable
Content-Type: application/json

{
  "error": "Service Unavailable",
  "message": "Failed to queue activity event"
}
```

**Example cURL Request**:

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

**Example JavaScript/Fetch Request**:

```javascript
fetch("http://localhost:3000/api/v1/activities", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    userId: "550e8400-e29b-41d4-a716-446655440000",
    eventType: "user_login",
    timestamp: new Date().toISOString(),
    payload: {
      ipAddress: "192.168.1.1",
      device: "desktop",
      browser: "Chrome",
    },
  }),
})
  .then((res) => res.json())
  .then((data) => console.log(data));
```

**Example Python Request**:

```python
import requests
import json
from datetime import datetime

url = 'http://localhost:3000/api/v1/activities'
payload = {
    'userId': '550e8400-e29b-41d4-a716-446655440000',
    'eventType': 'user_login',
    'timestamp': datetime.now().isoformat() + 'Z',
    'payload': {
        'ipAddress': '192.168.1.1',
        'device': 'desktop',
        'browser': 'Chrome'
    }
}

response = requests.post(url, json=payload)
print(response.status_code)
print(response.json())
```

### 2. Health Check

**Endpoint**: `GET /health`

**Description**: Check API service health status.

**Success Response**:

```
HTTP/1.1 200 OK
Content-Type: application/json

{
  "status": "OK",
  "timestamp": "2023-10-27T10:15:30.123Z"
}
```

## Status Codes

| Code | Meaning               | Description                                      |
| ---- | --------------------- | ------------------------------------------------ |
| 202  | Accepted              | Event successfully queued for processing         |
| 400  | Bad Request           | Invalid input payload or missing required fields |
| 404  | Not Found             | Requested route does not exist                   |
| 429  | Too Many Requests     | Rate limit exceeded                              |
| 500  | Internal Server Error | Unexpected server error                          |
| 503  | Service Unavailable   | RabbitMQ or database unavailable                 |

## Event Processing

### Message Flow

1. **Ingestion**: Client sends activity event to API
2. **Validation**: API validates the event structure
3. **Rate Limiting**: IP-based rate limiting is applied
4. **Publishing**: If valid, event is published to RabbitMQ `user_activities` queue
5. **Response**: API returns 202 Accepted immediately
6. **Consumption**: Consumer service reads from queue
7. **Processing**: Consumer parses and stores event in MongoDB
8. **Acknowledgment**: Message is acknowledged after successful storage

### Event Schema in Database

```javascript
{
  id: "f7b3c2a1-5e8b-4f3a-9c7d-2e5a8b3c1f6d",           // Unique event ID (UUID)
  userId: "550e8400-e29b-41d4-a716-446655440000",       // User ID
  eventType: "user_login",                               // Event type
  timestamp: "2023-10-27T10:00:00.000Z",                 // Original event time
  processedAt: "2023-10-27T10:00:05.432Z",               // Processing timestamp
  payload: {
    ipAddress: "192.168.1.1",
    device: "desktop",
    browser: "Chrome"
  },
  createdAt: "2023-10-27T10:00:05.432Z",                 // MongoDB createdAt
  updatedAt: "2023-10-27T10:00:05.432Z"                  // MongoDB updatedAt
}
```

## Testing the API

### Using Postman

1. Create a new POST request to `http://localhost:3000/api/v1/activities`
2. Set header: `Content-Type: application/json`
3. Add JSON body with required fields
4. Click Send

### Using curl

```bash
# Single request
curl -X POST http://localhost:3000/api/v1/activities \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "test-user-123",
    "eventType": "page_view",
    "timestamp": "2023-10-27T10:00:00Z",
    "payload": {"page": "/home"}
  }'

# Test rate limiting (50 requests per 60 seconds)
for i in {1..55}; do
  curl -X POST http://localhost:3000/api/v1/activities \
    -H "Content-Type: application/json" \
    -d '{
      "userId": "test-user-'$i'",
      "eventType": "ping",
      "timestamp": "2023-10-27T10:00:00Z"
    }'
  sleep 0.1
done
```

### Using Node.js

```javascript
const http = require("http");

const data = JSON.stringify({
  userId: "550e8400-e29b-41d4-a716-446655440000",
  eventType: "user_login",
  timestamp: new Date().toISOString(),
  payload: { device: "desktop" },
});

const options = {
  hostname: "localhost",
  port: 3000,
  path: "/api/v1/activities",
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "Content-Length": data.length,
  },
};

const req = http.request(options, (res) => {
  console.log(`statusCode: ${res.statusCode}`);
  res.on("data", (d) => console.log(JSON.parse(d)));
});

req.write(data);
req.end();
```

## Error Handling

The API implements comprehensive error handling:

1. **Validation Errors**: Invalid request payloads receive 400 responses with detailed error messages
2. **Rate Limit Errors**: Exceeded rate limits receive 429 responses with Retry-After header
3. **Service Errors**: RabbitMQ/database errors receive 503 responses
4. **Server Errors**: Unexpected errors receive 500 responses

## Best Practices

1. **Always include a timestamp**: Use ISO-8601 format with timezone
2. **Use UUIDs for userId**: Ensures uniqueness and scalability
3. **Respect Retry-After**: When receiving 429, wait the indicated seconds
4. **Idempotent payloads**: Include unique identifiers in payload for idempotency
5. **Dense logging**: The service logs all activities for debugging

## Rate Limiting Algorithm

The API uses a **sliding window counter** algorithm:

- Tracks request timestamps in a moving window
- Window size: 60 seconds (configurable)
- Max requests: 50 per window (configurable)
- Tracked per IP address

### Example Timeline

```
Time (s)  |  0    10    20    30    40    50    60    70    80
Requests  | [###.###.###.###.###.###.###.###.###.###] (50 requests in 60s)
Result    | 202  202   202   202   202   202   202   429   202
```

At t=70s, the 51st request is blocked because 50 requests were made in the last 60 seconds. After the oldest request (at t=0s) falls outside the window, new requests are allowed.
