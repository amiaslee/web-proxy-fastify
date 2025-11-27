#!/bin/bash
# More aggressive rate limit test - synchronous rapid-fire requests

BASE_URL="http://localhost:3001"
TEST_URL="${BASE_URL}/https://httpbin.org/get"

echo "=== Rapid-Fire Rate Limit Test ==="
echo "Sending requests as fast as possible (no delay)..."

success_count=0
rate_limited_count=0

# Send 70 requests without any delay
for i in {1..70}; do
    response=$(curl -s -o /dev/null -w "%{http_code}" -m 2 "$TEST_URL" 2>/dev/null || echo "000")
    
    if [ "$response" = "200" ]; then
        ((success_count++))
        printf "."
    elif [ "$response" = "429" ]; then
        ((rate_limited_count++))
        printf "X"
        # Show first 429 response
        if [ $rate_limited_count -eq 1 ]; then
            echo ""
            echo "First 429 response:"
            curl -s "$TEST_URL"
            echo ""
        fi
    else
        printf "?"
    fi
done

echo ""
echo ""
echo "Results:"
echo "  - Successful requests: $success_count"
echo "  - Rate limited (429): $rate_limited_count"
echo "  - Expected limit: 60 requests/min"

if [ $rate_limited_count -gt 0 ]; then
    echo "  ✅ PASS: Rate limiting is working!"
else
    echo "  ❌ FAIL: No rate limiting detected after  $((success_count)) requests"
    echo ""
    echo "Checking server stats..."
    curl -s http://localhost:3001/ | python3 -m json.tool | grep -A 5 "statistics"
fi
