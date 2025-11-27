#!/bin/bash
BASE_URL="http://localhost:3001"

echo "=== Verifying System Path Exemptions ==="

# 1. Exhaust quota
echo "1. Exhausting quota..."
curl -s -o /dev/null "$BASE_URL/https://httpbin.org/bytes/2048"
echo "   Request sent."

# 2. Check /health (should be 200)
echo "2. Checking /health (expect 200):"
code=$(curl -s -w "%{http_code}" -o /dev/null "$BASE_URL/health")
echo "   Result: $code"
if [ "$code" != "200" ]; then echo "❌ Failed"; else echo "✅ Passed"; fi

# 3. Check /card-info (should be 400 because no code, NOT 429)
echo "3. Checking /card-info (expect 400):"
code=$(curl -s -w "%{http_code}" -o /dev/null "$BASE_URL/card-info")
echo "   Result: $code"
if [ "$code" != "400" ]; then echo "❌ Failed (got $code)"; else echo "✅ Passed"; fi

# 4. Check /recharge (expect 400)
echo "4. Checking /recharge (expect 400):"
code=$(curl -s -w "%{http_code}" -o /dev/null "$BASE_URL/recharge")
echo "   Result: $code"
if [ "$code" != "400" ]; then echo "❌ Failed (got $code)"; else echo "✅ Passed"; fi

# 5. Check proxy (expect 429)
echo "5. Checking proxy (expect 429):"
code=$(curl -s -w "%{http_code}" -o /dev/null "$BASE_URL/https://httpbin.org/get")
echo "   Result: $code"
if [ "$code" != "429" ]; then echo "❌ Failed (got $code)"; else echo "✅ Passed"; fi
