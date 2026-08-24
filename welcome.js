'use strict';

// Seeds a single welcome card the very first time Station runs, so a new
// install shows something real instead of an empty box. Guarded by a marker
// file in ~/.station so it never comes back once it has been dismissed.

const fs   = require('fs');
const os   = require('os');
const path = require('path');

const MARKER = path.join(os.homedir(), '.station', '.welcomed');

function hasCards(inbox) {
  try {
    return fs.readdirSync(inbox).some(f => f.endsWith('.json'));
  } catch (e) {
    return false;
  }
}

function seedWelcome(inbox) {
  try {
    if (fs.existsSync(MARKER)) return false;

    fs.mkdirSync(inbox, { recursive: true });
    fs.mkdirSync(path.dirname(MARKER), { recursive: true });

    // Someone whose agents already post here does not need the tour.
    if (hasCards(inbox)) {
      fs.writeFileSync(MARKER, new Date().toISOString());
      return false;
    }

    // Local time, not UTC. The cards agents write use local time, and a UTC
    // stamp would make a brand new card read as hours old.
    const now  = new Date();
    const pad  = n => String(n).padStart(2, '0');
    const date = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
    const time = `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
    const iso   = `${date}T${time}`;
    const stamp = `${date}-${pad(now.getHours())}${pad(now.getMinutes())}`;

    const card = {
      agent:         'station',
      agent_display: 'Station',
      timestamp:     iso,
      status:        'fyi',
      category:      'work',
      headline:      'Station is working. This is what an agent update looks like.',
      summary:       `Your agents post here by dropping a JSON file into ${inbox}, and Station picks it up straight away with no restart needed. Each card needs a headline, a status and a summary at minimum. The full field list is in the README under "How agents post to Station", and you can point Station at a different folder by editing ~/.station/config.json. Tick this card off once you have read it and it will not come back.`,
      actions_needed: [
        'Point your first agent at the inbox folder',
        'Right-click the widget to switch between widget, app and menu bar modes',
      ],
      files_created: [],
      full_brief_path: '',
    };

    fs.writeFileSync(
      path.join(inbox, `station-welcome-${stamp}.json`),
      JSON.stringify(card, null, 2)
    );
    fs.writeFileSync(MARKER, now.toISOString());
    return true;
  } catch (e) {
    // A failed welcome card must never stop Station starting.
    return false;
  }
}

module.exports = { seedWelcome };
