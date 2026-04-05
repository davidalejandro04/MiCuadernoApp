#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

step() {
  printf "\n==> %s\n" "$1"
}

info() {
  printf "    %s\n" "$1"
}

fail() {
  printf "ERROR: %s\n" "$1" >&2
  exit 1
}

step "Checking prerequisites..."
command -v node >/dev/null 2>&1 || fail "Node.js is not installed. Install it from https://nodejs.org"
command -v npm >/dev/null 2>&1 || fail "npm is not found."
info "Node.js $(node -v)"
info "npm $(npm -v)"

step "Checking source runtime assets..."
[[ -f "bin/llama-server.exe" ]] || fail "Missing required runtime asset: bin/llama-server.exe"

if ! find models -maxdepth 1 -type f -name '*.gguf' ! -name 'mmproj*' | grep -q .; then
  fail "No runnable GGUF model was found in models/"
fi

step "Installing project dependencies..."
npm install

if [[ ! -x "node_modules/.bin/electron-builder" && ! -x "node_modules/.bin/electron-builder.cmd" ]]; then
  step "Installing electron-builder..."
  npm install --save-dev electron-builder
else
  info "electron-builder found in node_modules"
fi

if [[ ! -f "build/icon.png" || ! -f "build/icon.ico" ]]; then
  step "Generating placeholder icons..."
  node build-icon.js
else
  info "build/icon.png and build/icon.ico found"
fi

[[ -f "electron-builder.json" ]] || fail "electron-builder.json is missing"

step "Checking package.json..."
node build-pkg.js

step "Preparing installer resources..."
node scripts/prepare-installer-resources.mjs

TARGET_FLAG="${1:-}"

step "Building distributable..."
info "Output will be in ./dist/"
info "Each build uses a fresh temp output folder to avoid locked unpack directories"

case "$TARGET_FLAG" in
  --win)
    node scripts/run-electron-builder.mjs --win
    ;;
  --mac)
    node scripts/run-electron-builder.mjs --mac
    ;;
  --linux)
    node scripts/run-electron-builder.mjs --linux
    ;;
  "")
    node scripts/run-electron-builder.mjs
    ;;
  *)
    fail "Unknown target flag: $TARGET_FLAG"
    ;;
esac

printf "\n==> Build complete! Distributable files are in ./dist/\n\n"
ls -lh dist/ 2>/dev/null || echo "(dist/ directory listing not available)"
