'use strict';

const { app, BrowserWindow, Tray, nativeImage, Menu, Notification } = require('electron');
const path  = require('path');
const os    = require('os');
const fs    = require('fs');
const { startServer } = require('./server.js');
const { seedWelcome } = require('./welcome.js');

app.name = 'Station';

// ── Config ─────────────────────────────────────────────────────────────────

const CONFIG_PATH = path.join(os.homedir(), '.station', 'config.json');

function loadConfig() {
  try {
    if (fs.existsSync(CONFIG_PATH)) return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  } catch (e) {}
  return {};
}

function ensureConfig() {
  const defaults = {
    inbox:  path.join(os.homedir(), '.station', 'inbox'),
    port:   2626,
    tabs:   ['Work', 'Personal'],
    mode:   'widget',   // 'widget' | 'app' | 'menubar'
  };
  const dir = path.dirname(CONFIG_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(CONFIG_PATH)) {
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(defaults, null, 2));
    return defaults;
  }
  return Object.assign({}, defaults, loadConfig());
}

// ── Badge / count ──────────────────────────────────────────────────────────

function countUrgent(inbox) {
  let n = 0;
  try {
    for (const f of fs.readdirSync(inbox)) {
      if (!f.endsWith('.json')) continue;
      try {
        const item = JSON.parse(fs.readFileSync(path.join(inbox, f), 'utf8'));
        if (item.status === 'error' || item.status === 'needs_input') n++;
      } catch (e) {}
    }
  } catch (e) {}
  return n;
}

function updateBadge(inbox, tray) {
  const n = countUrgent(inbox);
  if (app.dock) app.dock.setBadge(n > 0 ? String(n) : '');
  if (tray)     tray.setTitle(n > 0 ? ` ${n}` : '');
}

// ── Notifications ──────────────────────────────────────────────────────────

// Track which IDs we've already notified about.
// Populated on startup so we don't spam existing items.
const notifiedIds = new Set();

function initNotifiedIds(inbox) {
  try {
    for (const f of fs.readdirSync(inbox)) {
      if (f.endsWith('.json')) notifiedIds.add(f.replace('.json', ''));
    }
  } catch (e) {}
}

function checkForNewItems(inbox) {
  try {
    for (const f of fs.readdirSync(inbox)) {
      if (!f.endsWith('.json')) continue;
      const id = f.replace('.json', '');
      if (notifiedIds.has(id)) continue;
      notifiedIds.add(id);
      try {
        const item = JSON.parse(fs.readFileSync(path.join(inbox, f), 'utf8'));
        if (item.status === 'error' || item.status === 'needs_input') {
          new Notification({
            title: 'Station — ' + (item.agent_display || item.agent || 'Agent'),
            body:  item.headline || (item.status === 'error' ? 'An agent hit an error' : 'An agent needs your input'),
          }).show();
        }
      } catch (e) {}
    }
  } catch (e) {}
}

// ── Tray icon ──────────────────────────────────────────────────────────────

function makeTrayIcon() {
  // Use icon-tray.png if present (16×16, black on transparent for macOS template image)
  // Falls back to embedded base64 dot if file not found
  const trayPath = path.join(__dirname, 'icon-tray.png');
  if (fs.existsSync(trayPath)) {
    const img = nativeImage.createFromPath(trayPath);
    img.setTemplateImage(true);
    return img;
  }
  const ICON_B64 = 'iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAQ0lEQVR42mNgGLYgEogPAPF3KD4AFSMK9ADxfxy4hxib/xPAeF1ygAgDDuAz4DsRBnynqQEUe4HiQKQ4GqmSkIYYAADzRE518OQkKQAAAABJRU5ErkJggg==';
  const buf = Buffer.from(ICON_B64, 'base64');
  const img = nativeImage.createFromBuffer(buf, { scaleFactor: 1.0 });
  img.setTemplateImage(true);
  return img;
}

// ── Widget mode (frameless, vibrancy, sits on desktop) ─────────────────────

function createWidget(url, config) {
  const win = new BrowserWindow({
    width:       config.width  || 320,
    height:      config.height || 600,
    x:           config.x,
    y:           config.y,
    frame:       false,
    transparent: true,
    resizable:   true,
    alwaysOnTop: false,
    skipTaskbar: false,
    webPreferences: { nodeIntegration: false, contextIsolation: true },
  });

  win.loadURL(url);

  win.on('moved', () => {
    const [x, y] = win.getPosition();
    const cfg = loadConfig(); cfg.x = x; cfg.y = y;
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2));
  });
  win.on('resized', () => {
    const [w, h] = win.getSize();
    const cfg = loadConfig(); cfg.width = w; cfg.height = h;
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2));
  });

  win.webContents.on('context-menu', () => {
    Menu.buildFromTemplate([
      { label: 'Reload',           click: () => win.reload() },
      { type: 'separator' },
      { label: 'Switch to app',      click: () => switchMode('app') },
      { label: 'Switch to menu bar', click: () => switchMode('menubar') },
      { type: 'separator' },
      { label: 'Quit Station',     click: () => app.quit() },
    ]).popup();
  });

  return win;
}

// ── App mode (standard window, in dock, feels like a regular app) ──────────

function createApp(url, config) {
  const win = new BrowserWindow({
    width:    config.width  || 360,
    height:   config.height || 700,
    x:        config.x,
    y:        config.y,
    frame:    true,
    resizable: true,
    alwaysOnTop: false,
    skipTaskbar: false,
    webPreferences: { nodeIntegration: false, contextIsolation: true },
  });

  win.loadURL(url);

  win.on('moved', () => {
    const [x, y] = win.getPosition();
    const cfg = loadConfig(); cfg.x = x; cfg.y = y;
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2));
  });
  win.on('resized', () => {
    const [w, h] = win.getSize();
    const cfg = loadConfig(); cfg.width = w; cfg.height = h;
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2));
  });

  win.webContents.on('context-menu', () => {
    Menu.buildFromTemplate([
      { label: 'Reload',           click: () => win.reload() },
      { type: 'separator' },
      { label: 'Switch to widget',   click: () => switchMode('widget') },
      { label: 'Switch to menu bar', click: () => switchMode('menubar') },
      { type: 'separator' },
      { label: 'Quit Station',     click: () => app.quit() },
    ]).popup();
  });

  return win;
}

// ── Menu bar mode (tray icon, dropdown panel) ──────────────────────────────

function createMenuBar(url) {
  const tray = new Tray(makeTrayIcon());
  tray.setToolTip('Station');

  const panel = new BrowserWindow({
    width:   320,
    height:  500,
    show:    false,
    frame:   false,
    transparent: true,
    resizable: false,
    skipTaskbar: true,
    alwaysOnTop: false,
    webPreferences: { nodeIntegration: false, contextIsolation: true },
  });

  panel.loadURL(url);
  panel.on('blur', () => panel.hide());

  tray.on('click', (event, bounds) => {
    if (panel.isVisible()) { panel.hide(); return; }
    const { x, y }        = bounds;
    const { width, height } = panel.getBounds();
    panel.setPosition(
      Math.round(x - width / 2),
      Math.round(process.platform === 'darwin' ? y : y - height)
    );
    panel.show();
    panel.focus();
  });

  tray.on('right-click', () => {
    Menu.buildFromTemplate([
      { label: 'Switch to widget', click: () => switchMode('widget') },
      { label: 'Switch to app',    click: () => switchMode('app') },
      { type: 'separator' },
      { label: 'Quit Station',     click: () => app.quit() },
    ]).popup();
  });

  return { tray, panel };
}

// ── Mode switching ─────────────────────────────────────────────────────────

function switchMode(newMode) {
  const cfg = loadConfig();
  cfg.mode  = newMode;
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2));
  app.relaunch();
  app.quit();
}

// ── App entry ──────────────────────────────────────────────────────────────

app.whenReady().then(() => {
  // Dock icon — replace with icon.png if it exists next to main.js
  const iconPath = path.join(__dirname, 'icon.png');
  if (fs.existsSync(iconPath) && app.dock) {
    app.dock.setIcon(nativeImage.createFromPath(iconPath));
  }

  const config = ensureConfig();
  const port   = config.port || 2626;
  const inbox  = config.inbox;
  const url    = `http://localhost:${port}`;
  const mode   = config.mode || 'widget';

  fs.mkdirSync(inbox, { recursive: true });

  // First run only: leave one card behind so a new install shows something real
  seedWelcome(inbox);

  // Seed notification tracking with existing inbox items (no spam on startup)
  initNotifiedIds(inbox);

  startServer(config, () => {
    let tray = null;

    if (mode === 'menubar') {
      app.dock?.hide();
      const mb = createMenuBar(url);
      tray = mb.tray;
    } else if (mode === 'app') {
      createApp(url, config);
    } else {
      // Default: widget
      createWidget(url, config);
    }

    // Initial badge
    updateBadge(inbox, tray);

    // Watch inbox for new files → update badge and fire notifications
    try {
      fs.watch(inbox, () => {
        updateBadge(inbox, tray);
        checkForNewItems(inbox);
      });
    } catch (e) {}
  });
});

app.on('window-all-closed', () => {
  // Keep alive in menu bar mode (no windows, just tray)
  if (process.platform !== 'darwin') app.quit();
});
