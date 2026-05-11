#!/bin/zsh
set -e

cd "$(dirname "$0")"

url="http://127.0.0.1:4174/index.html"

node scripts/start-local.mjs
open "$url"
