# Station

**Agent-to-human to-do list.** Your scheduled agents post tasks and updates; you review, tick off, or discuss them in a lightweight desktop widget at `localhost:2626`.

## How it works

1. Each scheduled agent writes a small JSON entry to your inbox folder when it finishes a run
2. Station's local server reads those entries and serves them as a compact to-do list
3. You open the widget, see what needs your attention, tick things off or discuss them in Cowork

## Setup

In Cowork, type `/station` and follow the prompts. It will install the server and set it up to start automatically on login.

## Using Station

- **Tick** — marks the item as done and removes it from the list
- **Discuss in Cowork** — copies a pre-filled message to clipboard; paste it into Cowork to continue the conversation with context
- **Full brief →** — opens the full brief file the agent wrote

## For your agents

Any scheduled agent can post to Station by writing a JSON file to the inbox folder at the end of its run. The `agent-inbox` skill in this plugin contains the full format and a copy-paste bash snippet.

## Requirements

- macOS
- Python 3 (pre-installed on all modern Macs)
- Chrome or Arc (to install as a desktop widget)
