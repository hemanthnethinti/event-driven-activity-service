# cURL Examples for API Testing

This file contains ready-to-use cURL commands for testing the Event-Driven User Activity Service API.

## Basic Setup

```bash
# Set the base URL
API_URL="http://localhost:3000/api/v1"
```

## Endpoint Tests

### 1. Health Check

```bash
curl -X GET http://localhost:3000/health \
  -H "Content-Type: application/json"
```

Expected Response (200 OK):

```json
{
  "status": "OK",
  "timestamp": "2023-10-27T10:15:30.123Z"
}
```

### 2. Create Activity - Valid Request

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

Expected Response (202 Accepted):

```json
{
  "message": "Activity event accepted for processing",
  "activityId": "f7b3c2a1-5e8b-4f3a-9c7d-2e5a8b3c1f6d"
}
```

### 3. Create Activity - Minimal Payload

```bash
curl -X POST http://localhost:3000/api/v1/activities \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "test-user-123",
    "eventType": "page_view",
    "timestamp": "2023-10-27T10:00:00Z"
  }'
```

### 4. Create Activity - With Current Timestamp

```bash
curl -X POST http://localhost:3000/api/v1/activities \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "user-'$(date +%s%N)'",
    "eventType": "api_call",
    "timestamp": "'$(date -u +'%Y-%m-%dT%H:%M:%SZ')'",
    "payload": {
      "endpoint": "/api/test",
      "method": "POST"
    }
  }'
```

## Validation Tests

### 5. Missing userId

```bash
curl -X POST http://localhost:3000/api/v1/activities \
  -H "Content-Type: application/json" \
  -d '{
    "eventType": "test",
    "timestamp": "2023-10-27T10:00:00Z"
  }'
```

Expected Response (400 Bad Request):

```json
{
  "error": "Bad Request",
  "message": "Invalid input payload",
  "details": ["userId is required"]
}
```

### 6. Missing eventType

```bash
curl -X POST http://localhost:3000/api/v1/activities \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "test-user-123",
    "timestamp": "2023-10-27T10:00:00Z"
  }'
```

### 7. Empty eventType

```bash
curl -X POST http://localhost:3000/api/v1/activities \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "test-user-123",
    "eventType": "   ",
    "timestamp": "2023-10-27T10:00:00Z"
  }'
```

### 8. Invalid Timestamp Format

```bash
curl -X POST http://localhost:3000/api/v1/activities \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "test-user-123",
    "eventType": "test",
    "timestamp": "not-a-date"
  }'
```

### 9. Invalid Payload Type

```bash
curl -X POST http://localhost:3000/api/v1/activities \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "test-user-123",
    "eventType": "test",
    "timestamp": "2023-10-27T10:00:00Z",
    "payload": "should-be-object"
  }'
```

### 10. Payload as Array

```bash
curl -X POST http://localhost:3000/api/v1/activities \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "test-user-123",
    "eventType": "test",
    "timestamp": "2023-10-27T10:00:00Z",
    "payload": [1, 2, 3]
  }'
```

## Rate Limiting Tests

### 11. Test Rate Limit Threshold

Send 51 requests rapidly to trigger rate limit (limit is 50 per 60 seconds):

```bash
#!/bin/bash

API_URL="http://localhost:3000/api/v1"

for i in {1..55}; do
  RESPONSE=$(curl -s -w "\n%{http_code}" \
    -X POST "$API_URL/activities" \
    -H "Content-Type: application/json" \
    -d '{
      "userId": "rate-test-'$i'",
      "eventType": "test",
      "timestamp": "2023-10-27T10:00:00Z"
    }')

  HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
  echo "Request $i: HTTP $HTTP_CODE"

  if [ "$HTTP_CODE" = "429" ]; then
    RETRY_AFTER=$(curl -s -i \
      -X POST "$API_URL/activities" \
      -H "Content-Type: application/json" \
      -d '{
        "userId": "rate-test-blocked",
        "eventType": "test",
        "timestamp": "2023-10-27T10:00:00Z"
      }' | grep "Retry-After" | cut -d' ' -f2 | tr -d '\r')

    echo "Rate limit exceeded. Retry after: $RETRY_AFTER seconds"
    break
  fi

  sleep 0.05  # 50ms delay between requests
done
```

### 12. Capture Retry-After Header

```bash
curl -i -X POST http://localhost:3000/api/v1/activities \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "test",
    "eventType": "test",
    "timestamp": "2023-10-27T10:00:00Z"
  }' | grep "Retry-After"
```

Expected Output (after hitting limit):

```
Retry-After: 45
```

## Load Testing

### 13. Generate 100 Events

```bash
#!/bin/bash

API_URL="http://localhost:3000/api/v1"
COUNT=0
SUCCESS=0
FAILED=0

for i in {1..100}; do
  RESPONSE=$(curl -s -w "\n%{http_code}" \
    -X POST "$API_URL/activities" \
    -H "Content-Type: application/json" \
    -d '{
      "userId": "load-test-'$RANDOM'",
      "eventType": "test_event_'$(($i % 5))'",
      "timestamp": "'$(date -u +'%Y-%m-%dT%H:%M:%SZ')'",
      "payload": {
        "index": '$i',
        "batch": "load-test-1"
      }
    }')

  HTTP_CODE=$(echo "$RESPONSE" | tail -n1)

  if [ "$HTTP_CODE" = "202" ] || [ "$HTTP_CODE" = "200" ]; then
    ((SUCCESS++))
  else
    ((FAILED++))
  fi

  ((COUNT++))

  if [ $((COUNT % 10)) -eq 0 ]; then
    echo "Sent $COUNT events: $SUCCESS successful, $FAILED failed"
  fi

  sleep 0.01  # 10ms delay to avoid rate limiting
done

echo "Total: $COUNT events sent, $SUCCESS successful, $FAILED failed"
```

## Complex Payload Examples

### 14. E-commerce Event

```bash
curl -X POST http://localhost:3000/api/v1/activities \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "user-ecommerce-123",
    "eventType": "purchase_completed",
    "timestamp": "2023-10-27T10:00:00Z",
    "payload": {
      "orderId": "order-456",
      "amount": 99.99,
      "currency": "USD",
      "items": [
        {"productId": "prod-1", "quantity": 2, "price": 29.99},
        {"productId": "prod-2", "quantity": 1, "price": 40.01}
      ],
      "shippingAddress": {
        "country": "US",
        "state": "CA",
        "city": "San Francisco"
      }
    }
  }'
```

### 15. SaaS Subscription Event

```bash
curl -X POST http://localhost:3000/api/v1/activities \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "user-saas-456",
    "eventType": "subscription_upgraded",
    "timestamp": "2023-10-27T10:00:00Z",
    "payload": {
      "planOld": "free",
      "planNew": "professional",
      "monthlyCost": 29.99,
      "features": ["analytics", "api_access", "custom_domain"],
      "startDate": "2023-10-27",
      "billingCycle": "monthly"
    }
  }'
```

### 16. Mobile App Event

```bash
curl -X POST http://localhost:3000/api/v1/activities \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "user-mobile-789",
    "eventType": "app_session_end",
    "timestamp": "2023-10-27T10:00:00Z",
    "payload": {
      "sessionDurationSeconds": 1234,
      "deviceType": "ios",
      "osVersion": "17.0",
      "appVersion": "2.3.1",
      "screenName": "home",
      "eventCount": 42,
      "crashReported": false
    }
  }'
```

## Bash Function for Repeated Requests

Add this to your `.bashrc` or `.zshrc` for easy testing:

```bash
# Send multiple activities in rapid succession
send_activities() {
  local count=${1:-10}
  local api_url="http://localhost:3000/api/v1"

  for i in $(seq 1 $count); do
    curl -s -X POST "$api_url/activities" \
      -H "Content-Type: application/json" \
      -d '{
        "userId": "user-'$RANDOM'",
        "eventType": "test_'$RANDOM'",
        "timestamp": "'$(date -u +'%Y-%m-%dT%H:%M:%SZ')'",
        "payload": {"sequence": '$i'}
      }' &
  done

  wait
  echo "Sent $count activities"
}

# Check API health
check_health() {
  curl -s http://localhost:3000/health | jq .
}

# Count activities in MongoDB
count_activities() {
  docker-compose exec database mongosh -u user -p password activity_db \
    --eval 'db.activities.countDocuments()'
}

# Usage:
# send_activities 20
# check_health
# count_activities
```

## Docker Integration

### 17. Test Inside Container

```bash
# Execute cURL from inside API container
docker-compose exec api curl -X GET http://api:3000/health

# Execute cURL from inside consumer container
docker-compose exec consumer curl -X GET http://api:3000/health
```

### 18. Test with docker-compose from CLI

```bash
# Create network and services, then test
docker-compose up -d

# Wait for services to be healthy
sleep 10

# Run test request
curl -X POST http://localhost:3000/api/v1/activities \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "test-user",
    "eventType": "docker_test",
    "timestamp": "2023-10-27T10:00:00Z"
  }'

# Cleanup
docker-compose down
```

## Tips & Tricks

1. **Pretty Print JSON Response**:

   ```bash
   curl ... | jq .
   ```

2. **Show Response Headers**:

   ```bash
   curl -i ...
   ```

3. **Measure Response Time**:

   ```bash
   curl -w "@curl-format.txt" ...
   ```

4. **Save Response to File**:

   ```bash
   curl ... -o response.json
   ```

5. **Continue Even On Errors**:

   ```bash
   curl --fail-with-body ...
   ```

6. **Use Variables**:
   ```bash
   TIMESTAMP=$(date -u +'%Y-%m-%dT%H:%M:%SZ')
   USER_ID=$(uuidgen)
   curl ... -d '{"userId":"'$USER_ID'","timestamp":"'$TIMESTAMP'"}'
   ```
