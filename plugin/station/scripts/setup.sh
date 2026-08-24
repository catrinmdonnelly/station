#!/bin/bash
# Station Setup Script
# Run once: bash setup.sh /path/to/your/agent-inbox

set -e

INBOX_PATH="${1:-$HOME/.station/inbox}"
STATION_DIR="$HOME/.station"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLIST="$HOME/Library/LaunchAgents/com.station.server.plist"
PORT=2626

echo ""
echo "  Setting up Station..."
echo ""

# Create config dir
mkdir -p "$STATION_DIR"
mkdir -p "$INBOX_PATH"
mkdir -p "$INBOX_PATH/archived"

# Write config
cat > "$STATION_DIR/config.json" << EOF
{
  "inbox": "$INBOX_PATH",
  "port": $PORT
}
EOF

echo "  ✓ Config written to $STATION_DIR/config.json"
echo "  ✓ Inbox: $INBOX_PATH"

# Copy server script
cp "$SCRIPT_DIR/server.py" "$STATION_DIR/server.py"
echo "  ✓ Server installed"

# Write LaunchAgent plist (auto-starts on login)
cat > "$PLIST" << EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.station.server</string>
  <key>ProgramArguments</key>
  <array>
    <string>/usr/bin/python3</string>
    <string>$STATION_DIR/server.py</string>
  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardOutPath</key>
  <string>$STATION_DIR/station.log</string>
  <key>StandardErrorPath</key>
  <string>$STATION_DIR/station.log</string>
</dict>
</plist>
EOF

echo "  ✓ LaunchAgent created (Station will start on login)"

# Load it now
launchctl unload "$PLIST" 2>/dev/null || true
launchctl load "$PLIST"
echo "  ✓ Station started"

# Wait a moment then open
sleep 1.5
open "http://localhost:$PORT"

echo ""
echo "  Station is running at http://localhost:$PORT"
echo ""
echo "  To install as a desktop widget:"
echo "  1. In Chrome/Arc: open the three-dot menu → Cast/Save → Install Station"
echo "  2. Or: chrome://apps → Station → Open as window"
echo ""
echo "  Station will restart automatically each time you log in."
echo ""
