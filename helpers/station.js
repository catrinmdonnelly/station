'use strict';

/**
 * Station helper for Node agents.
 *
 * Tiny zero-dependency module so any agent can send an interactive card into
 * Station and wait for the user's response. File-based, stdlib only.
 *
 * Usage:
 *
 *   const station = require('./station');
 *
 *   const cardId = await station.sendCard({
 *     agent: 'grocery-bot',
 *     headline: 'Milk was out of stock, substitute it?',
 *     summary: 'Own-brand semi-skimmed at £0.95.',
 *     accent: '#2A9D5A',
 *     category: 'personal',
 *     components: [station.approval()],
 *   });
 *
 *   const response = await station.pollResponse(cardId, { timeout: 3600 });
 *   if (response && response.values.decision === 'approve') doTheThing();
 */

const fs   = require('fs');
const os   = require('os');
const path = require('path');

// Whatever inbox the user configured, falling back to Station's own default.
// Pass `inbox` to any of these functions to override it.
const CONFIG_PATH = path.join(os.homedir(), '.station', 'config.json');

function defaultInbox() {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      const cfg = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
      if (cfg.inbox) return cfg.inbox;
    }
  } catch (e) {}
  return path.join(os.homedir(), '.station', 'inbox');
}

function pad2(n) { return String(n).padStart(2, '0'); }

function nowStrings() {
  const d = new Date();
  const ts = `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
  const stem = `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}-${pad2(d.getHours())}${pad2(d.getMinutes())}${pad2(d.getSeconds())}`;
  return { ts, stem };
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ── Sending ────────────────────────────────────────────────────────────────

async function sendCard({
  agent,
  headline,
  summary       = '',
  components    = [],
  category      = 'work',
  accent        = null,
  cardId        = null,
  agentDisplay  = null,
  inbox         = null,
} = {}) {
  inbox = inbox || defaultInbox();
  fs.mkdirSync(inbox, { recursive: true });

  const { ts, stem } = nowStrings();

  // Only accurate to the second, so an agent sending twice inside one second
  // would otherwise overwrite its own first card and lose it.
  let fileStem = `${agent}-${stem}`;
  let n = 2;
  while (fs.existsSync(path.join(inbox, fileStem + '.json'))) {
    fileStem = `${agent}-${stem}-${n++}`;
  }

  const id = cardId || fileStem;

  const entry = {
    agent,
    agent_display: agentDisplay || agent.replace(/[-_]/g, ' '),
    timestamp:     ts,
    status:        'needs_input',
    category,
    headline,
    summary,
    interactive:   { card_id: id, components },
  };
  if (accent) entry.accent = accent;

  fs.writeFileSync(path.join(inbox, fileStem + '.json'), JSON.stringify(entry, null, 2));

  return id;
}

// ── Receiving ──────────────────────────────────────────────────────────────

async function pollResponse(cardId, { timeout = null, interval = 2, inbox = null } = {}) {
  inbox = inbox || defaultInbox();
  const responsePath = path.join(inbox, 'responses', `${cardId}.json`);
  const start = Date.now();
  while (true) {
    if (fs.existsSync(responsePath)) {
      return JSON.parse(fs.readFileSync(responsePath, 'utf8'));
    }
    if (timeout !== null && (Date.now() - start) / 1000 > timeout) return null;
    await sleep(interval * 1000);
  }
}

function takeResponse(cardId, { inbox = null } = {}) {
  inbox = inbox || defaultInbox();
  const responsePath = path.join(inbox, 'responses', `${cardId}.json`);
  if (!fs.existsSync(responsePath)) return null;
  const data = JSON.parse(fs.readFileSync(responsePath, 'utf8'));
  fs.unlinkSync(responsePath);
  return data;
}

// ── Component builders ─────────────────────────────────────────────────────

const approval = ({ id = 'decision', label = '', approveLabel = 'Approve', declineLabel = 'Decline' } = {}) => ({
  type: 'approval', id, label, approve_label: approveLabel, decline_label: declineLabel,
});

const buttons = (id, options) => ({ type: 'buttons', id, options });

const button = (value, label, style = 'secondary') => ({ value, label, style });

const option = (value, label) => ({ value, label });

// Station renders approval and buttons. Nothing else. A card carrying any
// other component type draws no controls at all, so the user cannot answer
// it and pollResponse would wait forever.

module.exports = {
  sendCard, pollResponse, takeResponse,
  approval, buttons, button, option,
};
