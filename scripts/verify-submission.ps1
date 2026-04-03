param(
  [switch]$IncludeOutageTest,
  [int]$RateLimitRequests = 60
)

$ErrorActionPreference = 'Stop'

function Write-Section {
  param([string]$Title)
  Write-Host ""
  Write-Host "===== $Title =====" -ForegroundColor Cyan
}

function Invoke-ApiPost {
  param([string]$Body)
  try {
    $resp = Invoke-WebRequest -Method Post -Uri 'http://localhost:3000/api/v1/activities' -ContentType 'application/json' -Body $Body -UseBasicParsing
    return @{ Success = $true; StatusCode = $resp.StatusCode; Headers = $resp.Headers; Body = $resp.Content }
  } catch {
    $statusCode = $_.Exception.Response.StatusCode.value__
    $headers = $_.Exception.Response.Headers
    $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
    $rawBody = $reader.ReadToEnd()
    return @{ Success = $false; StatusCode = $statusCode; Headers = $headers; Body = $rawBody }
  }
}

Write-Section 'Pre-check: Docker services'

docker compose ps

Write-Section 'Queue verification (RabbitMQ API)'

$queueJson = curl.exe -s -u guest:guest http://localhost:15672/api/queues/%2F/user_activities
if (-not $queueJson) {
  throw 'RabbitMQ queue API returned empty response.'
}

$queue = $queueJson | ConvertFrom-Json
Write-Host "Queue Name: $($queue.name)"
Write-Host "Durable: $($queue.durable)"
Write-Host "Consumers: $($queue.consumers)"
if ($queue.message_stats) {
  Write-Host "Published: $($queue.message_stats.publish)"
  Write-Host "Acked: $($queue.message_stats.ack)"
  Write-Host "Redelivered: $($queue.message_stats.redeliver)"
}

if ($queue.name -ne 'user_activities') {
  throw 'Queue user_activities not found.'
}
if (-not $queue.durable) {
  throw 'Queue is not durable.'
}

Write-Section 'Validation failure test (expect 400)'

$invalidResp = Invoke-ApiPost -Body '{"userId":"u1"}'
if ($invalidResp.StatusCode -eq 429) {
  $retryAfter = 60
  if ($invalidResp.Headers -and $invalidResp.Headers['Retry-After']) {
    $retryAfter = [int]$invalidResp.Headers['Retry-After']
  }

  Write-Host "Validation test hit rate limit. Waiting $retryAfter seconds and retrying..."
  Start-Sleep -Seconds ($retryAfter + 1)
  $invalidResp = Invoke-ApiPost -Body '{"userId":"u1"}'
}

Write-Host "Status: $($invalidResp.StatusCode)"
Write-Host "Body: $($invalidResp.Body)"
if ($invalidResp.StatusCode -ne 400) {
  throw 'Invalid payload did not return 400.'
}

Write-Section "Rate limiting test (expect 50 accepted, rest 429)"

# If previous traffic already consumed quota, wait for window reset first.
$prepBody = '{"userId":"550e8400-e29b-41d4-a716-446655440000","eventType":"rate_prep","timestamp":"2026-03-23T12:29:59Z","payload":{"step":"prep"}}'
$prepResp = Invoke-ApiPost -Body $prepBody
if ($prepResp.StatusCode -eq 429) {
  $retryAfter = 60
  if ($prepResp.Headers -and $prepResp.Headers['Retry-After']) {
    $retryAfter = [int]$prepResp.Headers['Retry-After']
  }

  Write-Host "Rate window active. Waiting $retryAfter seconds before test..."
  Start-Sleep -Seconds ($retryAfter + 1)
}

$total = $RateLimitRequests
$accepted = 0
$rateLimited = 0
$other = 0

for ($i = 1; $i -le $total; $i++) {
  $body = '{"userId":"550e8400-e29b-41d4-a716-446655440000","eventType":"rate_test","timestamp":"2026-03-23T12:30:00Z","payload":{"seq":' + $i + '}}'
  $resp = Invoke-ApiPost -Body $body

  if ($resp.StatusCode -eq 202) {
    $accepted++
  } elseif ($resp.StatusCode -eq 429) {
    $rateLimited++
  } else {
    $other++
  }
}

Write-Host "TOTAL=$total ACCEPTED=$accepted RATE_LIMITED=$rateLimited OTHER=$other"
if ($accepted -gt 50) {
  throw "Rate limiter failed. Accepted more than 50 requests: $accepted."
}
if ($rateLimited -lt 1) {
  throw 'Expected at least one 429 response, got none.'
}

Write-Section 'Idempotency test (duplicate message id)'

$auth = [Convert]::ToBase64String([Text.Encoding]::ASCII.GetBytes('guest:guest'))
$headers = @{ Authorization = "Basic $auth" }
$dupId = 'dup-id-verify-script'

$msg = @{
  id = $dupId
  userId = '550e8400-e29b-41d4-a716-446655440000'
  eventType = 'duplicate_test'
  timestamp = '2026-03-23T12:35:00Z'
  payload = @{ source = 'verify-script' }
} | ConvertTo-Json -Compress

$publishBody = @{
  properties = @{ content_type = 'application/json'; delivery_mode = 2 }
  routing_key = 'user_activities'
  payload = $msg
  payload_encoding = 'string'
} | ConvertTo-Json -Compress

Invoke-RestMethod -Method Post -Uri 'http://localhost:15672/api/exchanges/%2F/amq.default/publish' -Headers $headers -ContentType 'application/json' -Body $publishBody | Out-Null
Invoke-RestMethod -Method Post -Uri 'http://localhost:15672/api/exchanges/%2F/amq.default/publish' -Headers $headers -ContentType 'application/json' -Body $publishBody | Out-Null

Start-Sleep -Seconds 4

$dupCount = docker compose exec -T database mongosh --quiet -u user -p password --authenticationDatabase admin activity_db --eval "db.activities.countDocuments({id:'$dupId'})"
$dupCount = [int]($dupCount | Select-Object -Last 1)
Write-Host "Duplicate ID count in DB: $dupCount"
if ($dupCount -ne 1) {
  throw "Idempotency failed. Expected count 1, got $dupCount."
}

if ($IncludeOutageTest) {
  Write-Section 'Mongo outage test (optional destructive test)'

  docker stop event-mongodb | Out-Null
  try {
    $outageBody = '{"userId":"550e8400-e29b-41d4-a716-446655440000","eventType":"db_outage_retry_test","timestamp":"2026-03-23T12:40:00Z","payload":{"case":"retry-check"}}'
    $outageResp = Invoke-ApiPost -Body $outageBody
    Write-Host "API status during outage: $($outageResp.StatusCode)"
    if ($outageResp.StatusCode -ne 202) {
      throw 'API did not accept event during outage test.'
    }

    Start-Sleep -Seconds 20
    docker compose logs --no-color --tail=80 consumer
  } finally {
    docker start event-mongodb | Out-Null
    Start-Sleep -Seconds 12
  }
}

Write-Section 'Verification summary'
Write-Host 'PASS: queue exists and is durable'
Write-Host 'PASS: invalid payload returns 400'
Write-Host 'PASS: rate limit enforces 50/min per IP'
Write-Host 'PASS: duplicate event id stored once'
Write-Host 'Done.' -ForegroundColor Green
