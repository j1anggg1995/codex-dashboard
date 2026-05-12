#!/bin/zsh
set -e

cd "$(dirname "$0")"

files_dir="$PWD/codex看板 Files"
url="http://127.0.0.1:4174/index.html"

if [ ! -f "$files_dir/index.html" ]; then
  echo "找不到 codex看板 Files/index.html，请确认压缩包已经完整解压。"
  exit 1
fi

if ! command -v node >/dev/null 2>&1; then
  echo "这台 Mac 还没有安装 Node.js。"
  echo "请先安装 Node.js 18 或更高版本，然后再双击打开。"
  echo "下载地址：https://nodejs.org/"
  exit 1
fi

cd "$files_dir"
node scripts/start-local.mjs
open "$url"
