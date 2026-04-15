# Agent Inbox — Convention

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
- `needs_input` — agent is blocked or needs a decision (shows amber)
- `completed` — agent finished, no action needed (shows green)
- `fyi` — informational update only (shows blue)
- `error` — something failed and needs attention (shows red, sorted to top)

## Category values
- `work` — routes to the Work tab
- `personal` — routes to the Personal tab
- Defaults to `work` if omitted

## Inbox path
Default: `~/Documents/Claude/agent-inbox`
Configured at: `~/.station/config.json`

## Bash snippet for agents
```bash
TIMESTAMP=$(date +%Y-%m-%dT%H:%M:%S)
FILENAME="agent-name-$(date +%Y-%m-%d-%H%M).json"
INBOX="$HOME/Documents/Claude/agent-inbox"
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
