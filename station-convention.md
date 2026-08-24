# Agent Inbox Convention

Every scheduled agent should write a JSON entry here when it completes a run.

## File naming
`[agent-name]-[YYYY-MM-DD-HHMM].json`
Example: `steelspec-monetisation-agent-2026-04-07-0906.json`

## JSON format

```json
{
  "agent": "steelspec-monetisation-agent",
  "agent_display": "SteelSpec Monetisation",
  "timestamp": "2026-04-07T09:06:00",
  "status": "needs_input",
  "category": "work",
  "headline": "Short summary of what happened",
  "summary": "Longer description of what the agent did and found.",
  "actions_needed": ["Action 1", "Action 2"],
  "files_created": ["outputs/some-file.md"],
  "full_brief_path": "outputs/some-brief.md"
}
```

## Status values
- `needs_input`: agent is blocked or needs a decision (shows amber)
- `completed`: agent finished, no action needed (shows green)
- `fyi`: informational update only (shows blue)
- `error`: something failed and needs attention (shows red, sorted to top)
- `responded`: set by Station when you answer an interactive card, not written by agents

## Category values
The category is the tab name, lowercased, with spaces turned into hyphens.

- `work`: routes to the Work tab
- `personal`: routes to the Personal tab
- `wylfa-hardtops`: routes to a tab called "Wylfa Hardtops"
- Defaults to the first tab if omitted, or if the category matches no tab

Tabs are edited from the tab strip in Station: `+` adds one, double-click renames.

## Inbox path
Default: `~/.station/inbox`
Configured at: `~/.station/config.json`

## Bash snippet for agents
```bash
TIMESTAMP=$(date +%Y-%m-%dT%H:%M:%S)
FILENAME="agent-name-$(date +%Y-%m-%d-%H%M).json"
INBOX="$HOME/.station/inbox"
mkdir -p "$INBOX"
cat > "$INBOX/$FILENAME" << ENDJSON
{
  "agent": "agent-name",
  "agent_display": "Agent Display Name",
  "timestamp": "$TIMESTAMP",
  "status": "needs_input",
  "headline": "...",
  "summary": "...",
  "actions_needed": [],
  "files_created": [],
  "full_brief_path": ""
}
ENDJSON
```
