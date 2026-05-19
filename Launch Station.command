#!/bin/bash
# Double-click this file in Finder to open Station

export PATH=/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin
STATION_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ELECTRON="$STATION_DIR/node_modules/.bin/electron"
LOG="$HOME/.station/station.log"

# If Station is already running, just bring it to front
if pgrep -f "electron.*station" > /dev/null 2>&1; then
  osascript -e 'tell application "Electron" to activate' 2>/dev/null
  exit 0
fi

# Launch detached from terminal
nohup "$ELECTRON" "$STATION_DIR" > "$LOG" 2>&1 &
disown

exit 0
