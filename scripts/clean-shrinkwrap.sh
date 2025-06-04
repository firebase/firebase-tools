#!/bin/bash
set -e

npx ts-node ./scripts/clean-shrinkwrap.ts "$1"
