# Station

**A lightweight local inbox for your AI agents.**

Station runs quietly in the background and shows you what your scheduled agents have been up to — what they finished, what files they created, and where they need your input. It can run as a floating desktop widget (always on top, with real macOS frosted glass) or as a menu bar app.

---

## What it does

When you run scheduled Claude agents (via Claude Code, Cowork, or your own scripts), they write small JSON entries to a local inbox folder. Station reads those entries and shows them as a clean to-do list:

- **Error** — something failed and needs your attention (sorts to top, shown in red)
- **Your call** — the agent is waiting on you
- **Heads up** — work done, nothing urgent
- **Sorted** — completed, ready to dismiss

You can tick items off, snooze them until 8am tomorrow, open the full brief the agent wrote, or copy a pre-filled message to continue the conversation in your AI tool. Station auto-refreshes every 2 minutes and shows a live badge count for urgent items.

---

## Install

### Option A — Electron app (recommended)

Electron gives you a proper native app: a floating widget with real macOS frosted glass, an always-on-top window that sits on your desktop, a dock badge for urgent items, and an optional menu bar mode.

**Requirements:** macOS · Node.js 18+

```bash
git clone https://github.com/catrindonnelly/station.git
cd station
npm install
npm start
```

On first launch, Station creates `~/.station/config.json` and opens in widget mode — a small frameless window with frosted glass that floats above your other apps.

**Switch to menu bar mode:** right-click the widget and choose "Switch to menu bar". The app moves to your macOS menu bar and opens as a dropdown on click.

**Switch back:** right-click the tray icon and choose "Switch to widget".

### Option B — Browser / LaunchAgent

If you'd rather not use Electron, Station can also run as a headless Node server and be viewed in any browser.

```bash
git clone https://github.com/catrindonnelly/station.git
cd station
bash setup.sh
```

Station starts immediately and opens at `http://localhost:2626`. The setup script installs a macOS LaunchAgent so it restarts automatically on login. To install as a Chrome desktop app: open the Chrome menu (⋮) → Cast, save and share → Install Station.

**Custom inbox path:**

```bash
bash setup.sh /path/to/your/inbox
```

---

## Configuration

Config lives at `~/.station/config.json`:

```json
{
  "inbox": "~/Documents/Claude/agent-inbox",
  "port": 2626,
  "tabs": ["Work", "Personal"],
  "mode": "widget"
}
```

| Key | Default | Description |
|-----|---------|-------------|
| `inbox` | `~/Documents/Claude/agent-inbox` | Folder Station watches for JSON entries |
| `port` | `2626` | Local port for the HTTP server |
| `tabs` | `["Work", "Personal"]` | Tab labels (maps to `category` in your JSON files) |
| `mode` | `widget` | `widget` or `menubar` (Electron only) |
| `width` | `320` | Widget width in pixels (saved automatically on resize) |
| `height` | `600` | Widget height in pixels |
| `x` / `y` | — | Widget position (saved automatically on drag) |

---

## How agents post to Station

At the end of any agent run, write a JSON file to the inbox folder:

```json
{
  "agent": "seo-monitor",
  "agent_display": "SEO Monitor",
  "timestamp": "2026-04-08T09:00:00",
  "status": "needs_input",
  "category": "work",
  "headline": "Three pages dropped out of top 10 — manual review needed",
  "summary": "Pages /products, /about, and /contact lost ranking overnight. Likely a crawl issue. Checked sitemap — all present. Needs eyes before next scheduled run.",
  "actions_needed": [
    "Check Google Search Console for crawl errors",
    "Confirm sitemap is being picked up correctly"
  ],
  "files_created": [
    "outputs/seo-report-2026-04-08.md"
  ],
  "full_brief_path": "outputs/seo-brief-2026-04-08.md"
}
```

**File naming:** `[agent-name]-[YYYY-MM-DD-HHMM].json`

### Status values

| Status | When to use |
|--------|-------------|
| `error` | Agent crashed or couldn't complete the run |
| `needs_input` | Agent is blocked and needs you to do something |
| `fyi` | Work done, no action needed |
| `completed` | Everything finished, nothing blocking |

### Category values

| Category | Tab |
|----------|-----|
| `work` | Work tab (default if omitted) |
| `personal` | Personal tab |

### Bash snippet

```bash
TIMESTAMP=$(date +%Y-%m-%dT%H:%M:%S)
INBOX="$HOME/Documents/Claude/agent-inbox"
cat > "$INBOX/my-agent-$(date +%Y-%m-%d-%H%M).json" << EOF
{
  "agent": "my-agent",
  "agent_display": "My Agent",
  "timestamp": "$TIMESTAMP",
  "status": "fyi",
  "category": "work",
  "headline": "Run complete",
  "summary": "Everything ran as expected.",
  "actions_needed": [],
  "files_created": []
}
EOF
```

---

## How it works

Station is intentionally simple:

- A Node.js HTTP server reads JSON files from your inbox folder and serves them as HTML
- In Electron mode, `main.js` wraps the server in a native window with `alwaysOnTop`, `vibrancy`, and a dock badge that updates live via `fs.watch()`
- In browser mode, a LaunchAgent keeps the server running in the background
- No database, no cloud, no accounts — just files and a local port

Agents write files in, Station reads them out, dismissed items move to `archived/`, snoozed items move to `snoozed/` and return the next morning.

---

## Uninstall

**Electron:** just delete the app / folder.

**LaunchAgent (browser mode):**

```bash
launchctl unload ~/Library/LaunchAgents/com.station.server.plist
rm ~/Library/LaunchAgents/com.station.server.plist
rm -rf ~/.station
```

Your inbox folder is left untouched.

---

## Licence

MIT
