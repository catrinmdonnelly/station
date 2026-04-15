#!/usr/bin/env python3
"""
Station — agent-to-human to-do list server.
Runs at http://localhost:2626
"""

import json
import os
import glob
import shutil
from datetime import datetime
from http.server import HTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs
import threading

# ── Config ────────────────────────────────────────────────────────────────────

CONFIG_PATH = os.path.expanduser("~/.station/config.json")

def load_config():
    if os.path.exists(CONFIG_PATH):
        with open(CONFIG_PATH) as f:
            return json.load(f)
    # Fallback: try to find inbox next to this script
    script_dir = os.path.dirname(os.path.abspath(__file__))
    return {
        "inbox": os.path.join(script_dir, "inbox"),
        "port": 2626
    }

config = load_config()
INBOX   = config.get("inbox", os.path.expanduser("~/Documents/Claude/agent-inbox"))
ARCHIVE = os.path.join(INBOX, "archived")
PORT    = config.get("port", 2626)

os.makedirs(INBOX,   exist_ok=True)
os.makedirs(ARCHIVE, exist_ok=True)

# ── Data ──────────────────────────────────────────────────────────────────────

def load_items():
    items = []
    for path in glob.glob(os.path.join(INBOX, "*.json")):
        try:
            with open(path) as f:
                item = json.load(f)
                item["_id"] = os.path.basename(path).replace(".json", "")
                item["_path"] = path
                items.append(item)
        except Exception:
            pass
    items.sort(key=lambda x: (
        0 if x.get("status") == "needs_input" else
        1 if x.get("status") == "fyi" else 2,
        x.get("timestamp", "")
    ), reverse=False)
    # Sort by status priority first, then newest within each group
    needs = sorted([i for i in items if i.get("status") == "needs_input"], key=lambda x: x.get("timestamp",""), reverse=True)
    fyi   = sorted([i for i in items if i.get("status") == "fyi"],         key=lambda x: x.get("timestamp",""), reverse=True)
    done  = sorted([i for i in items if i.get("status") == "completed"],   key=lambda x: x.get("timestamp",""), reverse=True)
    return needs + fyi + done

def dismiss_item(item_id):
    src = os.path.join(INBOX, item_id + ".json")
    if os.path.exists(src):
        dst = os.path.join(ARCHIVE, item_id + ".json")
        shutil.move(src, dst)
        return True
    return False

def format_time(ts_str):
    try:
        dt = datetime.fromisoformat(ts_str)
        now = datetime.now()
        diff = now - dt
        if diff.days == 0:
            if diff.seconds < 3600:
                m = diff.seconds // 60
                return f"{m}m ago" if m > 0 else "just now"
            else:
                h = diff.seconds // 3600
                return f"{h}h ago"
        elif diff.days == 1:
            return "yesterday"
        elif diff.days < 7:
            return f"{diff.days}d ago"
        else:
            return dt.strftime("%-d %b")
    except Exception:
        return ts_str

# ── HTML ──────────────────────────────────────────────────────────────────────

def render_page(items):
    needs_count = sum(1 for i in items if i.get("status") == "needs_input")

    def item_html(item):
        status    = item.get("status", "fyi")
        headline  = item.get("headline", "")
        agent     = item.get("agent_display", item.get("agent", "Agent"))
        ts        = format_time(item.get("timestamp", ""))
        summary   = item.get("summary", "")
        actions   = item.get("actions_needed", [])
        files     = item.get("files_created", [])
        brief     = item.get("full_brief_path", "")
        item_id   = item.get("_id", "")

        status_class = status.replace("_", "-")
        dot_color = {"needs_input": "#F59E0B", "fyi": "#60A5FA", "completed": "#22C55E"}.get(status, "#A0A0A0")
        status_label = {"needs_input": "Needs input", "fyi": "FYI", "completed": "Done"}.get(status, status)

        actions_html = ""
        if actions:
            lis = "".join(f'<li>{a}</li>' for a in actions)
            actions_html = f'<ul class="actions">{lis}</ul>'

        files_html = ""
        if files:
            pills = "".join(f'<span class="file-pill">{os.path.basename(f)}</span>' for f in files)
            files_html = f'<div class="files">{pills}</div>'

        brief_html = ""
        if brief:
            brief_path = os.path.join(os.path.dirname(INBOX), brief)
            brief_html = f'<a class="brief-link" href="file://{brief_path}" target="_blank">Full brief →</a>'

        discuss_text = f"Re: {agent} — {headline}\\n\\n"

        return f'''
        <div class="item {status_class}" data-id="{item_id}">
          <button class="tick" onclick="dismiss('{item_id}', this)" title="Mark done">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <circle cx="8" cy="8" r="7" stroke="currentColor" stroke-width="1.5"/>
              <path class="check" d="M5 8l2 2 4-4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </button>
          <div class="item-body">
            <div class="item-meta">
              <span class="dot" style="background:{dot_color}"></span>
              <span class="agent-name">{agent}</span>
              <span class="status-label {status_class}">{status_label}</span>
              <span class="item-time">{ts}</span>
            </div>
            <div class="headline">{headline}</div>
            {f'<div class="summary">{summary}</div>' if summary else ''}
            {actions_html}
            {files_html}
            <div class="item-footer">
              {brief_html}
              <button class="discuss" onclick="discuss(this, `{discuss_text}`)">Discuss in Cowork</button>
            </div>
          </div>
        </div>'''

    items_html = "".join(item_html(i) for i in items) if items else \
        '<div class="empty"><p>Nothing here. Your agents are on it.</p></div>'

    attention_text = f'<span class="attention">{needs_count} need{"s" if needs_count == 1 else ""} your input</span>' \
        if needs_count else '<span class="all-clear">All clear</span>'

    return f'''<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Station</title>
  <style>
    *, *::before, *::after {{ box-sizing: border-box; margin: 0; padding: 0; }}

    :root {{
      --bg: #F6F5F2;
      --surface: #FFFFFF;
      --border: #E4E3DF;
      --text: #18181A;
      --muted: #6F6E6B;
      --subtle: #A8A7A3;
      --amber: #B45309;
      --amber-light: #FEF3C7;
      --green: #15803D;
      --blue: #1D4ED8;
      --radius: 9px;
    }}

    html, body {{
      height: 100%;
      background: var(--bg);
      font-family: -apple-system, BlinkMacSystemFont, 'Helvetica Neue', sans-serif;
      font-size: 14px;
      color: var(--text);
      line-height: 1.5;
      -webkit-font-smoothing: antialiased;
    }}

    /* ── Header ── */
    .header {{
      position: sticky;
      top: 0;
      z-index: 10;
      background: rgba(246,245,242,0.92);
      backdrop-filter: blur(8px);
      -webkit-backdrop-filter: blur(8px);
      padding: 14px 18px 12px;
      border-bottom: 1px solid var(--border);
      display: flex;
      align-items: baseline;
      justify-content: space-between;
    }}

    .wordmark {{
      font-size: 15px;
      font-weight: 700;
      letter-spacing: -0.03em;
      color: var(--text);
    }}

    .attention {{
      font-size: 12px;
      font-weight: 600;
      color: var(--amber);
    }}

    .all-clear {{
      font-size: 12px;
      color: var(--subtle);
    }}

    /* ── List ── */
    .list {{
      padding: 10px 12px 40px;
      display: flex;
      flex-direction: column;
      gap: 6px;
    }}

    /* ── Item ── */
    .item {{
      background: var(--surface);
      border: 1px solid var(--border);
      border-left: 3px solid transparent;
      border-radius: var(--radius);
      padding: 12px 14px 12px 10px;
      display: flex;
      gap: 10px;
      align-items: flex-start;
      transition: opacity 0.25s, transform 0.25s;
    }}

    .item.needs-input {{ border-left-color: #F59E0B; }}
    .item.fyi         {{ border-left-color: #60A5FA; }}
    .item.completed   {{ border-left-color: #22C55E; }}

    .item.dismissing {{
      opacity: 0;
      transform: translateX(12px);
      pointer-events: none;
    }}

    /* ── Tick ── */
    .tick {{
      flex-shrink: 0;
      width: 28px;
      height: 28px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: none;
      border: none;
      cursor: pointer;
      color: var(--subtle);
      border-radius: 50%;
      transition: color 0.15s, background 0.15s;
      margin-top: 1px;
    }}

    .tick:hover {{
      color: var(--green);
      background: #F0FDF4;
    }}

    .tick .check {{
      opacity: 0;
      transition: opacity 0.15s;
    }}

    .tick:hover .check {{
      opacity: 1;
    }}

    /* ── Body ── */
    .item-body {{
      flex: 1;
      min-width: 0;
    }}

    .item-meta {{
      display: flex;
      align-items: center;
      gap: 6px;
      margin-bottom: 5px;
      flex-wrap: wrap;
    }}

    .dot {{
      width: 6px;
      height: 6px;
      border-radius: 50%;
      flex-shrink: 0;
    }}

    .agent-name {{
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.07em;
      color: var(--muted);
    }}

    .status-label {{
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.06em;
    }}
    .status-label.needs-input {{ color: var(--amber); }}
    .status-label.fyi         {{ color: var(--blue); }}
    .status-label.completed   {{ color: var(--green); }}

    .item-time {{
      font-size: 11px;
      color: var(--subtle);
      margin-left: auto;
    }}

    .headline {{
      font-size: 13.5px;
      font-weight: 600;
      letter-spacing: -0.01em;
      line-height: 1.35;
      color: var(--text);
      margin-bottom: 5px;
    }}

    .summary {{
      font-size: 12.5px;
      color: var(--muted);
      line-height: 1.6;
      margin-bottom: 8px;
    }}

    /* ── Actions ── */
    .actions {{
      list-style: none;
      margin: 6px 0 8px;
      padding-left: 10px;
      border-left: 2px solid #FDE68A;
    }}

    .actions li {{
      font-size: 12.5px;
      color: #5C3D00;
      line-height: 1.5;
      padding: 1px 0;
      position: relative;
      padding-left: 10px;
    }}

    .actions li::before {{
      content: "–";
      position: absolute;
      left: 0;
      color: #F59E0B;
    }}

    /* ── Files ── */
    .files {{
      display: flex;
      flex-wrap: wrap;
      gap: 5px;
      margin-bottom: 8px;
    }}

    .file-pill {{
      font-size: 11px;
      font-family: 'Menlo', monospace;
      background: var(--bg);
      border: 1px solid var(--border);
      border-radius: 4px;
      padding: 2px 6px;
      color: var(--muted);
    }}

    /* ── Footer ── */
    .item-footer {{
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-top: 6px;
      padding-top: 8px;
      border-top: 1px solid var(--border);
    }}

    .brief-link {{
      font-size: 12px;
      color: var(--subtle);
      text-decoration: none;
    }}
    .brief-link:hover {{ color: var(--muted); }}

    .discuss {{
      font-size: 11.5px;
      font-weight: 500;
      color: var(--muted);
      background: none;
      border: 1px solid var(--border);
      border-radius: 5px;
      padding: 3px 9px;
      cursor: pointer;
      font-family: inherit;
      transition: color 0.12s, border-color 0.12s, background 0.12s;
    }}

    .discuss:hover {{
      color: var(--text);
      border-color: #B0AFAB;
      background: var(--bg);
    }}

    .discuss.copied {{
      color: var(--green);
      border-color: #22C55E;
    }}

    /* ── Empty ── */
    .empty {{
      padding: 40px 20px;
      text-align: center;
      color: var(--subtle);
      font-size: 13px;
    }}
  </style>
</head>
<body>

  <div class="header">
    <div class="wordmark">Station</div>
    <div>{attention_text}</div>
  </div>

  <div class="list" id="list">
    {items_html}
  </div>

  <script>
    function dismiss(id, btn) {{
      const item = btn.closest('.item');
      item.classList.add('dismissing');
      setTimeout(() => {{
        fetch('/api/dismiss', {{
          method: 'POST',
          headers: {{'Content-Type': 'application/json'}},
          body: JSON.stringify({{id}})
        }}).then(() => {{
          item.remove();
          updateHeader();
        }}).catch(() => {{
          item.classList.remove('dismissing');
        }});
      }}, 250);
    }}

    function discuss(btn, text) {{
      navigator.clipboard.writeText(text).then(() => {{
        const orig = btn.textContent;
        btn.textContent = 'Copied';
        btn.classList.add('copied');
        setTimeout(() => {{
          btn.textContent = orig;
          btn.classList.remove('copied');
        }}, 1800);
      }});
    }}

    function updateHeader() {{
      const needs = document.querySelectorAll('.item.needs-input').length;
      const statusEl = document.querySelector('.header > div:last-child');
      if (needs > 0) {{
        statusEl.innerHTML = `<span class="attention">${{needs}} need${{needs === 1 ? 's' : ''}} your input</span>`;
      }} else {{
        statusEl.innerHTML = '<span class="all-clear">All clear</span>';
      }}
      if (document.querySelectorAll('.item').length === 0) {{
        document.getElementById('list').innerHTML = '<div class="empty"><p>Nothing here. Your agents are on it.</p></div>';
      }}
    }}

    // Auto-refresh every 2 minutes
    setTimeout(() => location.reload(), 120000);
  </script>

</body>
</html>'''

# ── HTTP Handler ──────────────────────────────────────────────────────────────

class StationHandler(BaseHTTPRequestHandler):
    def log_message(self, format, *args):
        pass  # Suppress request logs

    def send_json(self, data, status=200):
        body = json.dumps(data).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", len(body))
        self.end_headers()
        self.wfile.write(body)

    def send_html(self, html):
        body = html.encode()
        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", len(body))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        parsed = urlparse(self.path)
        if parsed.path in ("/", "/index.html"):
            items = load_items()
            self.send_html(render_page(items))
        elif parsed.path == "/api/items":
            self.send_json(load_items())
        else:
            self.send_response(404)
            self.end_headers()

    def do_POST(self):
        length = int(self.headers.get("Content-Length", 0))
        body = self.rfile.read(length)
        parsed = urlparse(self.path)

        if parsed.path == "/api/dismiss":
            try:
                data = json.loads(body)
                ok = dismiss_item(data.get("id", ""))
                self.send_json({"ok": ok})
            except Exception as e:
                self.send_json({"ok": False, "error": str(e)}, 400)
        else:
            self.send_response(404)
            self.end_headers()

# ── Main ──────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    server = HTTPServer(("127.0.0.1", PORT), StationHandler)
    print(f"Station running at http://localhost:{PORT}")
    print(f"Inbox: {INBOX}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStation stopped.")
