#!/bin/bash
# Test script for verifying rate limit and quota enforcement

set -e

BASE_URL="http://localhost:3001"
TEST_URL="${BASE_URL}/https://httpbin.org/get"

echo "=== Web Proxy Rate Limit & Quota Test ==="
echo ""

# Test 1: Rate Limit Test
echo "Test 1: Rate Limit (MAX_REQ_PER_MIN=60)"
echo "Sending 65 requests rapidly..."

success_count=0
rate_limited_count=0

for i in {1..65}; do
    response=$(curl -s -o /dev/null -w "%{http_code}" "$TEST_URL" 2>/dev/null || echo "000")
    
    if [ "$response" = "200" ]; then
        ((success_count++))
        echo -n "."
    elif [ "$response" = "429" ]; then
        ((rate_limited_count++))
        echo -n "X"
    else
        echo -n "?"
    fi
    
    # Small delay to avoid overwhelming the system
    sleep 0.01
done

echo ""
echo "Results:"
echo "  - Successful requests: $success_count"
echo "  - Rate limited (429): $rate_limited_count"

if [ $rate_limited_count -gt 0 ]; then
    echo "  ✅ PASS: Rate limiting is working!"
else
    echo "  ❌ FAIL: No rate limiting detected"
fi

echo ""
echo "Test 2: Verify 429 response details"
response=$(curl -s "$TEST_URL" 2>/dev/null || echo '{"error":"timeout"}')
http_code=$(curl -s -o /dev/null -w "%{http_code}" "$TEST_URL" 2>/dev/null || echo "000")

echo "HTTP Code: $http_code"
echo "Response: $response"

if [ "$http_code" = "429" ]; then
    echo "  ✅ PASS: Still rate limited as expected"
    
    # Check if response contains error details
    if echo "$response" | grep -q "Rate Limit Exceeded"; then
        echo "  ✅ PASS: Error message is correct"
    else
        echo "  ⚠️  WARNING: Error message format unexpected"
    fi
else
    echo "  ℹ️  INFO: Rate limit window may have reset"
fi

echo ""
echo "=== Test Completed ==="
