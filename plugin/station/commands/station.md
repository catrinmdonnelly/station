---
name: station
description: Open Station, check agent updates, or set up Station for the first time.
---

# /station

Handle all Station operations: setup, open, status check.

## What to do

### 1. Check if Station is running

```bash
curl -s http://localhost:2626 > /dev/null 2>&1 && echo "running" || echo "not running"
```

### 2. If running — open it

```bash
open http://localhost:2626
```

Tell the user: "Station is open at localhost:2626. To install as a desktop widget, use Chrome's Install App option from the browser menu."

### 3. If not running — check if it's installed

```bash
ls ~/.station/server.py 2>/dev/null && echo "installed" || echo "not installed"
```

**If installed but not running:** start it.
```bash
launchctl load ~/Library/LaunchAgents/com.station.server.plist 2>/dev/null
python3 ~/.station/server.py &
sleep 1
open http://localhost:2626
```

**If not installed:** run setup. The setup script is at `${CLAUDE_PLUGIN_ROOT}/scripts/setup.sh`.

Ask the user for their inbox path (default: `~/Documents/Claude/agent-inbox`), then run:
```bash
bash "${CLAUDE_PLUGIN_ROOT}/scripts/setup.sh" "/path/to/their/inbox"
```

### 4. After opening

Let the user know:
- Station is their agent-to-human to-do list — agents post tasks here, they tick them off or discuss them
- It auto-refreshes every 2 minutes
- To install as a desktop widget: in Chrome, open the menu (⋮) → More tools → Create shortcut → tick "Open as window"
- Station restarts automatically on login
