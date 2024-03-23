#!/bin/bash
set -euxo pipefail # bash strict mode
IFS=$'\n\t'

(cd v1 && npm i)
(cd v2 && npm i)
