#!/bin/bash
# Station setup — creates a Station.app and adds it to Login Items

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INBOX_PATH="${1:-$HOME/.station/inbox}"
STATION_DIR="$HOME/.station"
ELECTRON="$SCRIPT_DIR/node_modules/.bin/electron"
APP_PATH="$HOME/Applications/Station.app"

echo ""
echo "  Setting up Station..."
echo ""

# ── Check Node.js ───────────────────────────────────────────────────────────

if ! command -v node &>/dev/null; then
  echo "  ✗ Node.js is required. Install it from https://nodejs.org (LTS version)"
  exit 1
fi

# ── Install Electron if needed ──────────────────────────────────────────────

if [ ! -f "$ELECTRON" ]; then
  echo "  Installing dependencies..."
  cd "$SCRIPT_DIR" && npm install --silent
fi

echo "  ✓ Dependencies ready"

# ── Create dirs + config ────────────────────────────────────────────────────

mkdir -p "$STATION_DIR"
mkdir -p "$INBOX_PATH" "$INBOX_PATH/archived" "$INBOX_PATH/snoozed"

if [ ! -f "$STATION_DIR/config.json" ]; then
  cat > "$STATION_DIR/config.json" << EOF
{
  "inbox": "$INBOX_PATH",
  "port": 2626,
  "tabs": ["Work", "Personal"],
  "mode": "widget"
}
EOF
fi

echo "  ✓ Config ready"
echo "  ✓ Inbox: $INBOX_PATH"

# ── Remove old LaunchAgent if present ──────────────────────────────────────

PLIST="$HOME/Library/LaunchAgents/com.station.server.plist"
if [ -f "$PLIST" ]; then
  launchctl unload "$PLIST" 2>/dev/null || true
  rm -f "$PLIST"
  echo "  ✓ Removed old LaunchAgent"
fi

# ── Create Station.app via AppleScript ──────────────────────────────────────

mkdir -p "$HOME/Applications"

# Kill any existing Station.app before recreating
osascript -e 'tell application "Station" to quit' 2>/dev/null || true
sleep 0.5

osacompile -o "$APP_PATH" << EOF
do shell script "export PATH=/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin; nohup '$ELECTRON' '$SCRIPT_DIR' > '$STATION_DIR/station.log' 2>&1 &"
EOF

# Give it a moment to write
sleep 0.5
echo "  ✓ Station.app created at ~/Applications/Station.app"

# ── Add to Login Items ──────────────────────────────────────────────────────

osascript << EOF
tell application "System Events"
  set existingItems to every login item whose name is "Station"
  repeat with li in existingItems
    delete li
  end repeat
  make login item at end with properties {path:"$APP_PATH", hidden:true}
end tell
EOF

echo "  ✓ Added to Login Items (will start on login)"

# ── Launch it now ───────────────────────────────────────────────────────────

open "$APP_PATH"
echo "  ✓ Station launched"
echo ""
echo "  Station is running. You can close this terminal."
echo "  It will start automatically every time you log in."
echo ""
echo "  To uninstall:"
echo "  rm -rf ~/Applications/Station.app"
echo "  (and remove from System Settings → General → Login Items)"
echo ""
