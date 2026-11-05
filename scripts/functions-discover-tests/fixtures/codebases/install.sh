#!/bin/bash
set -euxo pipefail # bash strict mode
IFS=$'\n\t'

(cd v1 && npm i --prefer-offline --no-audit)
(cd v2 && npm i --prefer-offline --no-audit)
