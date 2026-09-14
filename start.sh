#!/usr/bin/env bash
# maps2whatsapp launcher for macOS / Linux. Double-click (macOS: right-click > Open) or: bash start.sh
cd "$(dirname "$0")"
if ! command -v node >/dev/null 2>&1; then
  echo "Node.js is not installed. Install it from https://nodejs.org/en/download then run this again."
  command -v xdg-open >/dev/null && xdg-open https://nodejs.org/en/download; command -v open >/dev/null && open https://nodejs.org/en/download
  read -r -p "Press Enter to close."; exit 1
fi
[ -d node_modules ] || { echo "First run: installing… (about a minute)"; npm install --no-fund --no-audit; }
echo "Starting maps2whatsapp. Your browser will open. Press Ctrl+C to stop."
node server.js
