#!/usr/bin/env node

const { startServer } = require('../server.js');
const { seedWelcome } = require('../welcome.js');
const { execSync, exec } = require('child_process');
const os = require('os');
const fs = require('fs');
const path = require('path');

// ── Config ─────────────────────────────────────────────────────────────────

const CONFIG_PATH = path.join(os.homedir(), '.station', 'config.json');

function loadConfig() {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
    }
  } catch (e) {}
  return {
    inbox: path.join(os.homedir(), '.station', 'inbox'),
    port: 2626
  };
}

function ensureConfig() {
  const dir = path.dirname(CONFIG_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(CONFIG_PATH)) {
    const config = {
      inbox: path.join(os.homedir(), '.station', 'inbox'),
      port: 2626,
      tabs: ['Work', 'Personal']
    };
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
    return config;
  }
  return loadConfig();
}

// ── Entry ──────────────────────────────────────────────────────────────────

const args    = process.argv.slice(2);
const noOpen  = args.includes('--no-open');

const config = ensureConfig();
const port = config.port || 2626;

// First run only: leave one card behind so a new install shows something real
seedWelcome(config.inbox);

startServer(config, () => {
  const url = `http://localhost:${port}`;
  console.log(`\n  Station running at ${url}`);
  console.log(`  Inbox: ${config.inbox}\n`);

  if (!noOpen) {
    // Open browser
    const platform = process.platform;
    if (platform === 'darwin')  exec(`open ${url}`);
    else if (platform === 'win32') exec(`start ${url}`);
    else exec(`xdg-open ${url}`);
  }
});
