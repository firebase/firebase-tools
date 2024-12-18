#!/bin/bash
set -e

npx tsx ./scripts/clean-shrinkwrap.ts "$1"
