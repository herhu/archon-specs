#!/bin/bash

if [ -z "$TOKEN" ]; then
echo "Error: TOKEN environment variable is not set."
echo "Run: source scripts/get-token.sh"
exit 1
fi

BASE_URL="http://localhost:3000"

# Usage: ./curl.sh POST /path/to/resource '{"foo":"bar"}'
METHOD=${1:-GET}
PATH=${2:-/}
BODY=$3

if [ -z "$BODY" ]; then
curl -X "$METHOD" "$BASE_URL$PATH" \
-H "Authorization: Bearer $TOKEN" \
-H "Content-Type: application/json"
else
curl -X "$METHOD" "$BASE_URL$PATH" \
-H "Authorization: Bearer $TOKEN" \
-H "Content-Type: application/json" \
-d "$BODY"
fi
echo "" # Newline