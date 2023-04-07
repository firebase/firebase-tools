#!/bin/bash
set -euxo pipefail # bash strict mode
IFS=$'\n\t'

cd functions && pnpm install
