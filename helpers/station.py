"""
Station helper for Python agents.

Tiny zero-dependency module so any agent can send an interactive card into
Station and wait for the user's response. File-based, stdlib only.

Usage (simple approval):

    from station import send_card, poll_response, approval

    card_id = send_card(
        agent="grocery-bot",
        agent_display="Grocery bot",
        headline="Milk was out of stock, substitute it?",
        summary="Own-brand semi-skimmed at £0.95. The original was £1.25.",
        components=[approval()],
        accent="#2A9D5A",
        category="personal",
    )

    response = poll_response(card_id, timeout=3600)
    if response and response["values"]["decision"] == "approve":
        do_the_thing()

Usage (your own buttons):

    from station import send_card, poll_response, buttons, button

    card_id = send_card(
        agent="tax-assistant",
        headline="VAT return for May is ready to file",
        summary="Figures reconciled. Nothing looks out of place.",
        components=[
            buttons("action", [
                button("file", "File it", style="primary"),
                button("remind", "Remind me tomorrow"),
                button("cancel", "Leave it", style="destructive"),
            ]),
        ],
        accent="#1E5BD8",
    )
    response = poll_response(card_id, timeout=86400)
    if response and response["values"]["action"] == "file":
        file_the_return()

Station renders approval and buttons only.
"""

import json
import time
from datetime import datetime
from pathlib import Path

CONFIG_PATH = Path.home() / ".station" / "config.json"


def default_inbox():
    """Whatever inbox the user configured, falling back to Station's default."""
    try:
        if CONFIG_PATH.exists():
            cfg = json.loads(CONFIG_PATH.read_text())
            if cfg.get("inbox"):
                return Path(cfg["inbox"])
    except Exception:
        pass
    return Path.home() / ".station" / "inbox"


# ── Sending ───────────────────────────────────────────────────────────────

def send_card(
    agent,
    headline,
    summary="",
    components=None,
    category="work",
    accent=None,
    card_id=None,
    agent_display=None,
    inbox=None,
):
    """Write an interactive card to Station's inbox. Returns the card_id."""
    inbox_path = Path(inbox) if inbox else default_inbox()
    inbox_path.mkdir(parents=True, exist_ok=True)

    now = datetime.now()
    timestamp = now.strftime("%Y-%m-%dT%H:%M:%S")

    # Only accurate to the second, so an agent sending twice inside one second
    # would otherwise overwrite its own first card and lose it.
    stem = f"{agent}-{now.strftime('%Y-%m-%d-%H%M%S')}"
    file_stem, n = stem, 2
    while (inbox_path / f"{file_stem}.json").exists():
        file_stem = f"{stem}-{n}"
        n += 1

    if card_id is None:
        card_id = file_stem

    entry = {
        "agent":         agent,
        "agent_display": agent_display or agent.replace("-", " ").replace("_", " "),
        "timestamp":     timestamp,
        "status":        "needs_input",
        "category":      category,
        "headline":      headline,
        "summary":       summary,
        "interactive": {
            "card_id":    card_id,
            "components": components or [],
        },
    }
    if accent:
        entry["accent"] = accent

    entry_path = inbox_path / f"{file_stem}.json"
    with open(entry_path, "w") as f:
        json.dump(entry, f, indent=2)

    return card_id


# ── Receiving ─────────────────────────────────────────────────────────────

def poll_response(card_id, timeout=None, interval=2, inbox=None):
    """
    Block until the user responds to a card.

    timeout: seconds to wait. None means wait forever.
    interval: seconds between checks.

    Returns the parsed response dict, or None if timeout expired.
    """
    inbox_path = Path(inbox) if inbox else default_inbox()
    response_path = inbox_path / "responses" / f"{card_id}.json"

    start = time.time()
    while True:
        if response_path.exists():
            with open(response_path) as f:
                return json.load(f)
        if timeout is not None and (time.time() - start) > timeout:
            return None
        time.sleep(interval)


def take_response(card_id, inbox=None):
    """
    Non-blocking. Returns the response if it exists (and removes the file),
    or None if no response yet. Use this if your agent runs on a schedule
    and just checks for responses on each tick.
    """
    inbox_path = Path(inbox) if inbox else default_inbox()
    response_path = inbox_path / "responses" / f"{card_id}.json"
    if not response_path.exists():
        return None
    with open(response_path) as f:
        data = json.load(f)
    response_path.unlink()
    return data


# ── Component builders ────────────────────────────────────────────────────

def approval(id="decision", label="", approve_label="Approve", decline_label="Decline"):
    return {
        "type":          "approval",
        "id":            id,
        "label":         label,
        "approve_label": approve_label,
        "decline_label": decline_label,
    }


def buttons(id, options):
    return {"type": "buttons", "id": id, "options": options}


def button(value, label, style="secondary"):
    """style: 'primary' | 'secondary' | 'destructive'"""
    return {"value": value, "label": label, "style": style}


def option(value, label):
    return {"value": value, "label": label}


# Station renders approval and buttons. Nothing else. A card carrying any
# other component type draws no controls at all, so the user cannot answer
# it and poll_response would wait forever.
