#!/bin/bash

set -e

if [ -z "$1" ]; then
  echo "Usage: $0 <new_version>"
  exit 1
fi

NEW_VERSION=$1
SERVER_JSON_PATH="src/mcp/server.json"

awk -v new_version="$NEW_VERSION" '
  BEGIN { in_packages = 0 }
  /packages/ { in_packages = 1 }
  in_packages && /"version":/ {
    sub(/"version": ".*"/, "\"version\": \"" new_version "\"")
  }
  { print }
' "$SERVER_JSON_PATH" > tmp.json && mv tmp.json "$SERVER_JSON_PATH"


echo "Successfully updated firebase-tools version to $NEW_VERSION in $SERVER_JSON_PATH"

