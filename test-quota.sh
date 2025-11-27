#!/bin/bash
# Test script for verifying bandwidth quota enforcement

set -e

BASE_URL="http://localhost:3001"

echo "=== Bandwidth Quota Test ==="
echo ""

# Function to get status safely
get_status() {
    curl -s -w "%{http_code}" -o /tmp/proxy_response.json "$BASE_URL/"
}

# 1. Check initial status
echo "1. Checking current status..."
http_code=$(get_status)
echo "HTTP Code: $http_code"

if [ "$http_code" = "429" ]; then
    echo "⚠️  Already quota limited!"
    echo "Response:"
    cat /tmp/proxy_response.json
    echo ""
    echo "✅ PASS: Quota enforcement is working (requests are being blocked)."
    exit 0
fi

if [ "$http_code" != "200" ]; then
    echo "❌ Error: Unexpected status code $http_code"
    echo "Response:"
    cat /tmp/proxy_response.json
    exit 1
fi

# Parse quota info if 200
echo "Current Quota Status:"
cat /tmp/proxy_response.json | python3 -m json.tool | grep -A 8 "dailyQuota" || echo "Failed to parse quota info"

# 2. Run download test
echo ""
echo "2. Testing with medium-sized responses..."
echo "Downloading 20 x ~10KB responses..."

success_count=0
quota_exceeded_count=0

for i in {1..20}; do
    # Request 10KB of random data from httpbin
    response=$(curl -s -o /dev/null -w "%{http_code}" -m 5 "${BASE_URL}/https://httpbin.org/bytes/10240" 2>/dev/null || echo "000")
    
    if [ "$response" = "200" ]; then
        ((success_count++))
        printf "."
    elif [ "$response" = "429" ]; then
        ((quota_exceeded_count++))
        printf "Q"
        if [ $quota_exceeded_count -eq 1 ]; then
             echo ""
             echo ">> First 429 received!"
        fi
    else
        printf "?"
    fi
done

echo ""
echo ""
echo "Results:"
echo "  - Successful downloads: $success_count"
echo "  - Quota exceeded (429): $quota_exceeded_count"

if [ $quota_exceeded_count -gt 0 ]; then
    echo "✅ PASS: Quota enforcement is working!"
else
    echo "ℹ️  INFO: No quota exceeded during this test."
    echo "   You may need to lower MAX_BYTES_PER_DAY in .env to verify blocking."
fi
