#!/usr/bin/env bash
set -e

openssl aes-256-cbc \
  -K $encrypted_830857fa25dd_key \
  -iv $encrypted_830857fa25dd_iv \
  -in scripts/creds-public.json.enc \
  -out scripts/creds-public.json \
  -d || true

openssl aes-256-cbc \
  -K $encrypted_830857fa25dd_key \
  -iv $encrypted_830857fa25dd_iv \
  -in scripts/creds-private.json.enc \
  -out scripts/creds-private.json \
  -d || true

test -f scripts/creds-public.json || test -f scripts/creds-private.json || (echo "No Credentials Decrypted" && false)
