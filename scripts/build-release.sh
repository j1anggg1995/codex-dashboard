#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DIST_DIR="$ROOT_DIR/dist"
MAC_DIR="$DIST_DIR/codex看板-mac"
WIN_DIR="$DIST_DIR/codex看板-windows"
MAC_FILES_DIR="$MAC_DIR/codex看板 Files"
WIN_FILES_DIR="$WIN_DIR/codex看板 Files"

cd "$ROOT_DIR"

npm run build:frontend

rm -rf "$DIST_DIR"
mkdir -p \
  "$MAC_FILES_DIR/scripts" "$MAC_FILES_DIR/docs/assets" \
  "$WIN_FILES_DIR/scripts" "$WIN_FILES_DIR/docs/assets"

app_files=(
  "index.html"
  "styles.css"
  "styles-mac-console.css"
  "app.js"
  "data.sample.js"
)

script_files=(
  "scripts/generate-codex-data.mjs"
  "scripts/serve-local.mjs"
  "scripts/start-local.mjs"
  "scripts/stop-local.mjs"
)

for file in "${app_files[@]}"; do
  cp "$file" "$MAC_FILES_DIR/$file"
  cp "$file" "$WIN_FILES_DIR/$file"
done

for file in "${script_files[@]}"; do
  cp "$file" "$MAC_FILES_DIR/scripts/$(basename "$file")"
  cp "$file" "$WIN_FILES_DIR/scripts/$(basename "$file")"
done

for file in "README.md" "README.zh-CN.md" "LICENSE"; do
  cp "$file" "$MAC_FILES_DIR/docs/$file"
  cp "$file" "$WIN_FILES_DIR/docs/$file"
done

if [ -f "assets/codex-dashboard-preview.png" ]; then
  cp "assets/codex-dashboard-preview.png" "$MAC_FILES_DIR/docs/assets/codex-dashboard-preview.png"
  cp "assets/codex-dashboard-preview.png" "$WIN_FILES_DIR/docs/assets/codex-dashboard-preview.png"
fi

printf 'window.CODEXSCOPE_DATA = window.CODEXSCOPE_DATA || null;\n' > "$MAC_FILES_DIR/data.js"
printf 'window.CODEXSCOPE_DATA = window.CODEXSCOPE_DATA || null;\n' > "$WIN_FILES_DIR/data.js"

cp "macos/open-dashboard.command" "$MAC_DIR/Open codex看板.command"
cp "windows/open-dashboard.cmd" "$WIN_DIR/Open codex看板.cmd"

cat > "$MAC_DIR/START-HERE.txt" <<'TXT'
codex看板 macOS 用户先看

1. 双击 Open codex看板.command。
2. 如果 macOS 拦截，打开 系统设置 > 隐私与安全性，点击 仍要打开。
3. codex看板 Files 文件夹不用点，程序会自动使用里面的文件。
4. 这个版本需要本机已安装 Node.js 18 或更高版本。

运行后会打开：http://127.0.0.1:4174/index.html
本地服务会每 60 秒刷新一次 data.js。

如果你下载的是 GitHub 自动生成的 Source code (zip)，那是源码包，不是普通用户推荐下载。

1. Double-click Open codex看板.command.
2. If macOS blocks it, open System Settings > Privacy & Security, then click Open Anyway.
3. You do not need to open the codex看板 Files folder manually.
4. This version requires Node.js 18 or later.
TXT

cat > "$WIN_DIR/START-HERE.txt" <<'TXT'
codex看板 Windows 用户先看

1. 双击 Open codex看板.cmd。
2. codex看板 Files 文件夹不用点，程序会自动使用里面的文件。
3. 这个版本需要本机已安装 Node.js 18 或更高版本。

运行后会打开：http://127.0.0.1:4174/index.html
本地服务会每 60 秒刷新一次 data.js。

如果你下载的是 GitHub 自动生成的 Source code (zip)，那是源码包，不是普通用户推荐下载。

1. Double-click Open codex看板.cmd.
2. You do not need to open the codex看板 Files folder manually.
3. This version requires Node.js 18 or later.
TXT

chmod +x "$MAC_DIR/Open codex看板.command" "$MAC_FILES_DIR/scripts/"*.mjs

(
  cd "$DIST_DIR"
  zip -qr "codex-dashboard-mac.zip" "codex看板-mac"
  zip -qr "codex-dashboard-windows.zip" "codex看板-windows"
)

printf 'Built release packages:\n  %s\n  %s\n' \
  "$DIST_DIR/codex-dashboard-mac.zip" \
  "$DIST_DIR/codex-dashboard-windows.zip"
