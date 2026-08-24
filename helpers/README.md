# Station helpers

Two tiny zero-dependency libraries for writing agents that send Station a card and wait for your answer.

| File | For |
|------|-----|
| `station.py` | Python agents. Stdlib only (json, time, pathlib, datetime) |
| `station.js` | Node agents. Stdlib only (fs, os, path) |

You don't need these to use Station. An agent can always just write a JSON file into the inbox itself, as described in the main README. These exist so you don't have to hand-roll the sending and the waiting.

## What they do

Three operations:

1. **`send_card(...)` / `sendCard(...)`** writes a card into your inbox and returns its `card_id`. Station picks it up straight away.
2. **`poll_response(card_id, timeout=...)` / `pollResponse(cardId, {timeout})`** blocks until you answer, then returns the response.
3. **`take_response(card_id)` / `takeResponse(cardId)`** checks once without blocking, for agents that run on a schedule.

Plus builders for the two component types Station renders: `approval` and `buttons`.

The inbox comes from `~/.station/config.json`, falling back to `~/.station/inbox`. Pass `inbox=` to any function to point somewhere else.

## Example: approval

```python
from station import send_card, poll_response, approval

card_id = send_card(
    agent="grocery-bot",
    headline="Milk was out of stock, substitute it?",
    summary="Own-brand semi-skimmed at £0.95. The original was £1.25.",
    components=[approval()],
    accent="#2A9D5A",
    category="personal",
)
response = poll_response(card_id, timeout=3600)
if response and response["values"]["decision"] == "approve":
    do_the_thing()
```

## Example: scheduled agent, no blocking

For agents that run on a schedule rather than staying alive until answered, use `take_response()` to check for an answer and carry on:

```python
from station import send_card, take_response, buttons, button

# First run: send the card and persist the card_id somewhere your next run reads
card_id = send_card(
    agent="daily-briefing",
    headline="Top 3 priorities for today",
    summary="Ready whenever you are.",
    components=[buttons("action", [
        button("open", "Open the briefing", style="primary"),
        button("snooze", "Snooze"),
    ])],
)

# Later runs: has it been answered yet?
response = take_response(card_id)
if response is not None:
    action = response["values"]["action"]
```

`take_response` deletes the response file once it hands it to you, so you get it exactly once.

## Node

Same shape, promise-based:

```js
const station = require('./station');

const cardId = await station.sendCard({
  agent: 'deploy-bot',
  headline: 'Build 214 is ready to ship',
  components: [station.approval({ approveLabel: 'Ship it', declineLabel: 'Hold' })],
});

const response = await station.pollResponse(cardId, { timeout: 3600 });
if (response && response.values.decision === 'approve') ship();
```

## Where to put the file

Drop a copy of `station.py` or `station.js` into the agent's own folder and import it. If you have several agents, put it somewhere on `PYTHONPATH` or `NODE_PATH` instead of copying it around.

## Limits worth knowing

- **Two component types.** Station renders `approval` and `buttons`. A card carrying anything else draws no controls at all, so nobody can answer it and `poll_response` waits forever.
- **Polling, not subscriptions.** Lower `interval` if you need a faster turnaround.
- **No update or cancel.** To retract a card you sent, delete its file from the inbox folder.
- **These write files.** If your agent would rather speak HTTP, Station accepts `POST /api/cards` while it is running. See the main README.
