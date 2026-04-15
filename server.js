'use strict';

const http = require('http');
const fs   = require('fs');
const path = require('path');
const os   = require('os');
const { exec } = require('child_process');

// ── Data ───────────────────────────────────────────────────────────────────

function loadItems(inbox, snoozed) {
  checkSnoozed(inbox, snoozed);
  const items = [];
  if (!fs.existsSync(inbox)) return items;
  for (const file of fs.readdirSync(inbox)) {
    if (!file.endsWith('.json')) continue;
    try {
      const raw  = fs.readFileSync(path.join(inbox, file), 'utf8');
      const item = JSON.parse(raw);
      item._id   = file.replace('.json', '');
      items.push(item);
    } catch (e) {}
  }
  const order = { error: 0, needs_input: 1, fyi: 2, completed: 3 };
  items.sort((a, b) => {
    const sa = order[a.status] ?? 2;
    const sb = order[b.status] ?? 2;
    if (sa !== sb) return sa - sb;
    return (b.timestamp || '') > (a.timestamp || '') ? 1 : -1;
  });
  return items;
}

function dismissItem(inbox, archive, id) {
  const src = path.join(inbox, id + '.json');
  const dst = path.join(archive, id + '.json');
  if (!fs.existsSync(src)) return false;
  if (!fs.existsSync(archive)) fs.mkdirSync(archive, { recursive: true });
  fs.renameSync(src, dst);
  return true;
}

function snoozeItem(inbox, snoozed, id) {
  const src = path.join(inbox, id + '.json');
  if (!fs.existsSync(src)) return false;
  try {
    const item     = JSON.parse(fs.readFileSync(src, 'utf8'));
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(8, 0, 0, 0);
    item._snooze_until = tomorrow.toISOString();
    if (!fs.existsSync(snoozed)) fs.mkdirSync(snoozed, { recursive: true });
    fs.writeFileSync(path.join(snoozed, id + '.json'), JSON.stringify(item, null, 2));
    fs.unlinkSync(src);
    return true;
  } catch (e) { return false; }
}

function checkSnoozed(inbox, snoozed) {
  if (!fs.existsSync(snoozed)) return;
  const now = new Date();
  for (const file of fs.readdirSync(snoozed)) {
    if (!file.endsWith('.json')) continue;
    try {
      const item  = JSON.parse(fs.readFileSync(path.join(snoozed, file), 'utf8'));
      const until = new Date(item._snooze_until);
      if (now >= until) {
        delete item._snooze_until;
        fs.writeFileSync(path.join(inbox, file), JSON.stringify(item, null, 2));
        fs.unlinkSync(path.join(snoozed, file));
      }
    } catch (e) {}
  }
}

function archiveAllDone(inbox, archive) {
  let count = 0;
  if (!fs.existsSync(inbox)) return count;
  if (!fs.existsSync(archive)) fs.mkdirSync(archive, { recursive: true });
  for (const file of fs.readdirSync(inbox)) {
    if (!file.endsWith('.json')) continue;
    try {
      const item = JSON.parse(fs.readFileSync(path.join(inbox, file), 'utf8'));
      if (item.status === 'completed') {
        fs.renameSync(path.join(inbox, file), path.join(archive, file));
        count++;
      }
    } catch (e) {}
  }
  return count;
}

// ── Time ───────────────────────────────────────────────────────────────────

function formatTime(ts) {
  if (!ts) return '';
  try {
    const diff = (Date.now() - new Date(ts).getTime()) / 1000;
    if (diff < 60)     return 'just now';
    if (diff < 3600)   return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400)  return `${Math.floor(diff / 3600)}h ago`;
    if (diff < 172800) return 'yesterday';
    const d = new Date(ts);
    return `${d.getDate()} ${d.toLocaleString('en-GB', { month: 'short' })}`;
  } catch (e) { return ts; }
}

// ── Render ─────────────────────────────────────────────────────────────────

function renderAction(a) {
  if (typeof a === 'object' && a !== null) {
    const title = a.action || a.title || '';
    const desc  = a.description ? `<div class="action-desc">${a.description}</div>` : '';
    return `<div class="action-item">${title}${desc}</div>`;
  }
  return `<div class="action-item">${a}</div>`;
}

function esc(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderPage(items, config) {
  const tabs       = config.tabs || ['Work', 'Personal'];
  const tabIds     = tabs.map(t => t.toLowerCase().replace(/\s+/g, '-'));
  const defaultTab = tabIds[0];

  // Tab counts
  const counts = {};
  tabIds.forEach(t => counts[t] = 0);
  for (const item of items) {
    const cat = item.category || defaultTab;
    if (counts[cat] !== undefined) counts[cat]++;
    else counts[defaultTab]++;
  }

  const tabsHtml = tabs.map((name, i) => {
    const tid    = tabIds[i];
    const c      = counts[tid] || 0;
    const label  = c ? `${name} (${c})` : name;
    const active = i === 0 ? ' active' : '';
    return `<span class="tab${active}" id="tab-${tid}" onclick="switchTab('${tid}')">${label}</span>`;
  }).join('');

  function renderCard(item) {
    const status = item.status || 'fyi';
    const slabel = {
      needs_input: 'Your call',
      fyi:         'Heads up',
      completed:   'Sorted',
      in_progress: 'On it',
      review:      'Check this',
      error:       'Error',
    }[status] || status;
    const scls = {
      needs_input: 's-needs',
      fyi:         's-fyi',
      completed:   's-done',
      in_progress: 's-progress',
      review:      's-review',
      error:       's-error',
    }[status] || 's-fyi';

    const agent    = item.agent_display || item.agent || '';
    const iid      = item._id;
    const cat      = item.category || defaultTab;
    const ts       = formatTime(item.timestamp);
    const headline = item.headline || '';
    const summ     = item.summary || '';
    const actions  = item.actions_needed || [];
    const files    = item.files_created || [];
    const brief    = item.brief || item.brief_path || item.full_brief_path || '';

    const actionsHtml = actions.length
      ? `<div class="actions">${actions.map(renderAction).join('')}</div>`
      : '';

    const filesHtml = files.length
      ? `<div class="files">${files.map(f => `<span class="file-pill">${path.basename(f)}</span>`).join('')}</div>`
      : '';

    const briefBtn = brief
      ? `<button class="brief-btn" onclick="openBrief('${esc(brief)}')" title="Open brief">Brief</button>`
      : '';

    const discussText  = `Re: ${agent} - ${headline}\\n\\n`;
    const safeAgent    = esc(agent).replace(/'/g, "\\'");
    const safeHeadline = esc(headline).replace(/'/g, "\\'");

    return `<div class="card" id="card-${iid}" data-category="${cat}" data-status="${status}">
      <div class="meta-row">
        <span class="agent-name">${esc(agent)}</span>
        <span class="status-label ${scls}">${slabel}</span>
        <span class="ts">${ts}</span>
      </div>
      <div class="headline" onclick="toggle('${iid}')">${esc(headline)}</div>
      <div class="detail" id="detail-${iid}" style="display:none">
        ${summ ? `<div class="summary">${esc(summ)}</div>` : ''}
        ${actionsHtml}${filesHtml}
      </div>
      <div class="footer">
        <span class="more-btn" onclick="toggle('${iid}')" id="more-${iid}">More</span>
        <div class="footer-right">
          ${briefBtn}
          <button class="discuss-btn" id="discuss-${iid}"
            onclick="discuss('${iid}','${safeAgent}','${safeHeadline}','${esc(discussText)}')">Discuss</button>
          <button class="snooze-btn" data-tip="Snooze till 8am" onclick="snooze('${iid}')">
            <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
              <circle cx="6.5" cy="6.5" r="5.5" stroke="currentColor" stroke-width="1.4"/>
              <path d="M6.5 3.5v3l2 1.5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </button>
          <button class="tick-btn" data-tip="Mark done" onclick="dismiss('${iid}')">
            <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
              <path d="M3 8l3.5 3.5 5.5-6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </button>
        </div>
      </div>
    </div>`;
  }

  const cardsHtml = items.length
    ? items.map(renderCard).join('\n')
    : '<div class="empty">Nothing here. Your agents are on it.</div>';

  return `<!DOCTYPE html><html lang="en"><head>
<meta charset="UTF-8"><title>Station</title>
<link rel="manifest" href="/manifest.json">
<meta name="theme-color" content="#FFFFFF">
<style>
  *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}

  /* ── Station (default — white body, red header) ── */
  .bg{
    --text:#18181A;--muted:#3D3D3B;--subtle:#8A8A88;
    --border:rgba(0,0,0,0.09);
    --card-bg:#F8F8F7;--card-border:rgba(0,0,0,0.07);
    --tab-bg:#F2F2F0;--scrollthumb:rgba(0,0,0,0.12);
    --accent:#E63535;
    --header-bg:#E63535;--header-border:rgba(255,255,255,0.18);
    --header-btn-bg:rgba(255,255,255,0.15);--header-btn-border:rgba(255,255,255,0.25);
    --header-btn-color:rgba(255,255,255,0.72);--header-btn-hover:#FFFFFF;
    --wordmark:#FFFFFF;
    --action:#E63535;--action-border:rgba(230,53,53,0.22);
  }
  /* ── Light (warm neutral) ── */
  .bg.light{
    --text:#18181A;--muted:#4A4946;--subtle:#9A9896;
    --border:rgba(0,0,0,0.08);
    --card-bg:#FFFFFF;--card-border:rgba(0,0,0,0.07);
    --tab-bg:rgba(0,0,0,0.03);--scrollthumb:rgba(0,0,0,0.12);
    --accent:#18181A;
    --header-bg:rgba(255,255,255,0.96);--header-border:rgba(0,0,0,0.08);
    --header-btn-bg:#FFFFFF;--header-btn-border:rgba(0,0,0,0.09);
    --header-btn-color:#9A9896;--header-btn-hover:#18181A;
    --wordmark:#18181A;
    --action:#9A9896;--action-border:rgba(0,0,0,0.09);
  }
  /* ── Dark ── */
  .bg.dark{
    --text:#F2F2F7;--muted:#AEAEB2;--subtle:#636366;
    --border:rgba(255,255,255,0.09);
    --card-bg:rgba(255,255,255,0.06);--card-border:rgba(255,255,255,0.10);
    --tab-bg:rgba(255,255,255,0.04);--scrollthumb:rgba(255,255,255,0.15);
    --accent:#F2F2F7;
    --header-bg:rgba(28,28,30,0.96);--header-border:rgba(255,255,255,0.09);
    --header-btn-bg:rgba(255,255,255,0.07);--header-btn-border:rgba(255,255,255,0.10);
    --header-btn-color:#636366;--header-btn-hover:#F2F2F7;
    --wordmark:#F2F2F7;
    --action:#636366;--action-border:rgba(255,255,255,0.09);
  }
  /* ── Glass (transparent — relies on Electron vibrancy) ── */
  .bg.glass{
    --text:#FFFFFF;--muted:rgba(255,255,255,0.82);--subtle:rgba(255,255,255,0.45);
    --border:rgba(255,255,255,0.12);
    --card-bg:rgba(0,0,0,0);--card-border:rgba(255,255,255,0.14);
    --tab-bg:rgba(0,0,0,0);--scrollthumb:rgba(255,255,255,0.14);
    --accent:rgba(255,255,255,0.88);
    --header-bg:rgba(0,0,0,0);--header-border:rgba(255,255,255,0.12);
    --header-btn-bg:rgba(255,255,255,0.08);--header-btn-border:rgba(255,255,255,0.14);
    --header-btn-color:rgba(255,255,255,0.45);--header-btn-hover:rgba(255,255,255,0.90);
    --wordmark:rgba(255,255,255,0.88);
    --action:rgba(255,255,255,0.45);--action-border:rgba(255,255,255,0.12);
  }

  /* ── Status colours — station + light (light backgrounds) ── */
  .s-error{color:#DC2626} .s-needs{color:#D97706} .s-fyi{color:#4F46E5}
  .s-done{color:#16A34A}  .s-progress{color:#EA580C} .s-review{color:#7C3AED}

  /* ── Status colours — dark + glass (dark backgrounds) ── */
  .bg.dark .s-error,  .bg.glass .s-error{color:#FCA5A5}
  .bg.dark .s-needs,  .bg.glass .s-needs{color:#FCD34D}
  .bg.dark .s-fyi,    .bg.glass .s-fyi{color:#818CF8}
  .bg.dark .s-done,   .bg.glass .s-done{color:#4ADE80}
  .bg.dark .s-progress,.bg.glass .s-progress{color:#FB923C}
  .bg.dark .s-review, .bg.glass .s-review{color:#A78BFA}

  html,body{height:100%;background:transparent;
    font-family:-apple-system,BlinkMacSystemFont,'Helvetica Neue',sans-serif;
    font-size:13px;-webkit-font-smoothing:antialiased;overflow-x:hidden}

  .bg{height:100vh;display:flex;flex-direction:column;overflow:hidden;
    color:var(--text);background:#FFFFFF;transition:background 0.2s,color 0.2s}
  .bg.light{background:#F6F5F2}
  .bg.dark{background:#1C1C1E}
  .bg.glass{background:rgba(0,0,0,0.18) !important;transition:color 0.2s;
    box-shadow:inset 0 0 0 1px rgba(255,255,255,0.14)}

  /* ── Header ── */
  .header{flex-shrink:0;background:var(--header-bg);padding:10px 12px 9px;
    border-bottom:1px solid var(--header-border);display:flex;align-items:center;
    justify-content:space-between;backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);
    -webkit-app-region:drag}
  .wordmark{font-size:13px;font-weight:700;letter-spacing:-0.03em;
    color:var(--wordmark);-webkit-app-region:no-drag}
  .header-right{display:flex;align-items:center;gap:5px;-webkit-app-region:no-drag}

  /* ── Header icon buttons ── */
  .hdr-btn{width:22px;height:22px;border-radius:4px;
    border:1.5px solid var(--header-btn-border);
    background:var(--header-btn-bg);cursor:pointer;padding:0;flex-shrink:0;
    display:flex;align-items:center;justify-content:center;position:relative;
    color:var(--header-btn-color);transition:color 0.12s;-webkit-app-region:no-drag}
  .hdr-btn:hover{color:var(--header-btn-hover)}

  /* Theme button — round with half-shade */
  .mode-btn{width:22px;height:22px;border-radius:50%;
    border:1.5px solid var(--header-btn-border);
    background:var(--header-btn-bg);cursor:pointer;padding:0;flex-shrink:0;
    position:relative;overflow:hidden;-webkit-app-region:no-drag}
  .mode-btn::after{content:'';position:absolute;right:0;top:0;width:50%;height:100%;
    background:rgba(0,0,0,0.15)}
  .bg.dark .mode-btn::after,.bg.glass .mode-btn::after{background:rgba(255,255,255,0.15)}

  /* ── Tooltips ── */
  .hdr-btn[data-tip]{position:relative}
  .hdr-btn[data-tip]::before{
    content:attr(data-tip);position:absolute;
    top:calc(100% + 6px);left:50%;transform:translateX(-50%);
    background:rgba(15,15,15,0.86);color:#FFF;
    font-size:10px;font-weight:500;line-height:1;
    padding:4px 7px;border-radius:4px;white-space:nowrap;
    pointer-events:none;opacity:0;transition:opacity 0.15s;z-index:200}
  .hdr-btn[data-tip]:hover::before{opacity:1}
  /* Keep rightmost tooltip from clipping out of widget */
  .hdr-btn[data-tip]:last-child::before,
  .hdr-btn[data-tip].tip-left::before{left:auto;right:0;transform:none}

  .snooze-btn[data-tip],.tick-btn[data-tip]{position:relative}
  .snooze-btn[data-tip]::before,.tick-btn[data-tip]::before{
    content:attr(data-tip);position:absolute;
    bottom:calc(100% + 5px);left:50%;transform:translateX(-50%);
    background:rgba(15,15,15,0.86);color:#FFF;
    font-size:10px;font-weight:500;line-height:1;
    padding:4px 7px;border-radius:4px;white-space:nowrap;
    pointer-events:none;opacity:0;transition:opacity 0.15s;z-index:200}
  .snooze-btn[data-tip]:hover::before,.tick-btn[data-tip]:hover::before{opacity:1}
  .snooze-btn[data-tip]::before,.tick-btn[data-tip]::before{right:0;left:auto;transform:none}

  /* ── Tabs ── */
  .tabs{display:flex;padding:0 12px;border-bottom:1px solid var(--border);
    background:var(--tab-bg);flex-shrink:0;overflow-x:auto;scrollbar-width:none;
    -webkit-app-region:no-drag}
  .tabs::-webkit-scrollbar{display:none}
  .tab{font-size:11px;font-weight:600;color:var(--subtle);padding:7px 10px 6px;
    cursor:pointer;border-bottom:2px solid transparent;margin-bottom:-1px;
    transition:color 0.15s;white-space:nowrap}
  .tab.active{color:var(--text);border-bottom-color:var(--accent)}

  /* ── List ── */
  .list{padding:8px 8px 16px;display:flex;flex-direction:column;gap:4px;
    overflow-y:auto;flex:1;-webkit-app-region:no-drag}
  .list::-webkit-scrollbar{width:3px}
  .list::-webkit-scrollbar-track{background:transparent}
  .list::-webkit-scrollbar-thumb{background:var(--scrollthumb);border-radius:2px}

  /* ── Cards ── */
  .card{background:var(--card-bg);border:1px solid var(--card-border);
    border-radius:8px;padding:10px 11px 8px 10px;transition:box-shadow 0.12s;
    backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px)}
  .card:hover{box-shadow:0 2px 8px rgba(0,0,0,0.08)}
  .bg.dark .card:hover{box-shadow:0 2px 12px rgba(0,0,0,0.3)}
  /* Glass — remove card-level blur so OS vibrancy shows through cleanly */
  .bg.glass .card{backdrop-filter:none;-webkit-backdrop-filter:none}
  .bg.glass .card:hover{box-shadow:0 2px 14px rgba(0,0,0,0.18)}

  .meta-row{display:flex;align-items:center;gap:10px;margin-bottom:5px}
  .agent-name{font-size:11px;font-weight:700;color:var(--muted);
    width:80px;flex-shrink:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .status-label{font-size:11px;font-weight:600;flex-shrink:0}
  .ts{font-size:10px;color:var(--subtle);margin-left:auto;flex-shrink:0}

  .headline{font-size:12.5px;font-weight:600;letter-spacing:-0.01em;
    line-height:1.35;color:var(--text);cursor:pointer;margin-bottom:6px}
  .summary{font-size:11.5px;color:var(--muted);line-height:1.6;margin-bottom:7px}

  .actions{padding-left:8px;border-left:2px solid rgba(253,230,138,0.45);margin-bottom:7px}
  .action-item{font-size:11.5px;color:var(--muted);line-height:1.5;
    padding:1px 0 1px 9px;position:relative}
  .action-item::before{content:'–';position:absolute;left:0;color:var(--subtle)}
  .action-desc{font-size:11px;color:var(--subtle);margin-top:1px;line-height:1.4}

  .files{display:flex;flex-wrap:wrap;gap:4px;margin-bottom:6px}
  .file-pill{font-size:10px;font-family:Menlo,Monaco,monospace;
    background:var(--card-bg);border-radius:3px;padding:1px 5px;color:var(--muted)}

  .footer{display:flex;align-items:center;justify-content:space-between;
    padding-top:7px;border-top:1px solid var(--border);margin-top:4px}
  .footer-right{display:flex;align-items:center;gap:6px}
  .more-btn{font-size:11px;color:var(--action);cursor:pointer;font-weight:500}

  .discuss-btn,.brief-btn{font-size:11px;font-weight:500;
    font-family:-apple-system,BlinkMacSystemFont,'Helvetica Neue',sans-serif;
    background:var(--card-bg);border-radius:4px;padding:2px 7px;cursor:pointer}
  .discuss-btn{color:var(--action);border:1px solid var(--action-border)}
  .discuss-btn.copied{color:#16A34A;border-color:#22C55E}
  .bg.dark .discuss-btn.copied,.bg.glass .discuss-btn.copied{color:#4ADE80;border-color:#4ADE80}
  .brief-btn{color:#4338CA;border:1px solid rgba(67,56,202,0.25)}
  .bg.dark .brief-btn,.bg.glass .brief-btn{color:#818CF8;border-color:rgba(129,140,248,0.3)}

  .snooze-btn,.tick-btn{width:22px;height:22px;display:flex;align-items:center;
    justify-content:center;background:none;border:none;cursor:pointer;
    color:var(--action);padding:0;transition:color 0.12s}
  .snooze-btn:hover{color:#D97706}
  .tick-btn:hover{color:#16A34A}
  .bg.dark .snooze-btn:hover,.bg.glass .snooze-btn:hover{color:#FCD34D}
  .bg.dark .tick-btn:hover,.bg.glass .tick-btn:hover{color:#4ADE80}

  .empty{padding:28px 12px;text-align:center;font-size:12px;color:var(--subtle)}
  .card.dismissing{opacity:0;transform:translateX(10px);transition:opacity 0.2s,transform 0.2s}
</style></head><body>
<div class="bg" id="bg">
  <div class="header">
    <span class="wordmark">Station</span>
    <div class="header-right">
      <button class="hdr-btn" data-tip="Refresh" onclick="refresh()">
        <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
          <path d="M9.5 5.5A4 4 0 1 1 5.5 1.8" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
          <polyline points="5.5,0.5 7.5,2.2 5.5,3.8" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </button>
      <button class="hdr-btn" data-tip="Archive all sorted" id="archive-btn" onclick="archiveDone()">
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
          <rect x="1" y="4" width="10" height="7" rx="0.75" stroke="currentColor" stroke-width="1.3"/>
          <path d="M1 4l1-2.5h8L11 4" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
          <path d="M4.5 7.25L6 8.75l1.5-2" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </button>
      <button class="hdr-btn tip-left" data-tip="Toggle size" onclick="toggleSize()">
        <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
          <rect x="0.75" y="0.75" width="9.5" height="9.5" rx="1.5" stroke="currentColor" stroke-width="1.3"/>
          <path d="M3.5 0.75v9.5M0.75 3.5h2.75" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
        </svg>
      </button>
      <button class="mode-btn" onclick="cycleTheme()" title="Theme: station"></button>
    </div>
  </div>
  <div class="tabs">${tabsHtml}</div>
  <div class="list" id="list">${cardsHtml}</div>
</div>
<script>
  var TAB_IDS=${JSON.stringify(tabIds)};
  var TAB_NAMES=${JSON.stringify(tabs)};

  // ── Theme ──────────────────────────────────────────────────────────────────
  // Themes: station (white/red), light (warm neutral), dark, glass (transparent desktop)
  var THEMES=['station','light','dark','glass'];
  var themeIdx=parseInt(localStorage.getItem('station-theme')||'0');
  applyTheme();

  function applyTheme(){
    var bg=document.getElementById('bg');
    bg.className='bg';
    var t=THEMES[themeIdx];
    if(t!=='station') bg.classList.add(t);
    // Force true transparency for glass — CSS transition can leave residual colour
    bg.style.background = (t==='glass') ? 'rgba(0,0,0,0.18)' : '';
    var btn=document.querySelector('.mode-btn');
    if(btn) btn.title='Theme: '+t+' — click to cycle';
  }
  function cycleTheme(){
    themeIdx=(themeIdx+1)%THEMES.length;
    localStorage.setItem('station-theme',themeIdx);
    applyTheme();
  }

  // ── Size toggle (browser mode) ─────────────────────────────────────────────
  var COMPACT_W=320,COMPACT_H=600;
  var isCompact=localStorage.getItem('station-size')!=='wide';
  function toggleSize(){
    if(isCompact){
      window.resizeTo(screen.availWidth,screen.availHeight);
      isCompact=false;localStorage.setItem('station-size','wide');
    } else {
      window.resizeTo(COMPACT_W,COMPACT_H);
      isCompact=true;localStorage.setItem('station-size','compact');
    }
  }

  // ── Refresh ────────────────────────────────────────────────────────────────
  function refresh(){ location.reload(); }

  // ── Archive all done ───────────────────────────────────────────────────────
  function archiveDone(){
    var btn=document.getElementById('archive-btn');
    if(btn){btn.style.opacity='0.5';btn.disabled=true;}
    fetch('/api/archive-all',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'})
      .then(function(){
        document.querySelectorAll('.card[data-status="completed"]').forEach(function(c){
          c.classList.add('dismissing');
          setTimeout(function(){c.remove();},200);
        });
        setTimeout(function(){
          updateCounts();
          checkEmpty();
          if(btn){btn.style.opacity='';btn.disabled=false;}
        },250);
      })
      .catch(function(){
        if(btn){btn.style.opacity='';btn.disabled=false;}
      });
  }

  // ── Tabs ───────────────────────────────────────────────────────────────────
  var activeTab=TAB_IDS[0];
  document.querySelectorAll('.card').forEach(function(c){
    c.style.display=c.dataset.category===activeTab?'':'none';
  });

  function switchTab(tab){
    activeTab=tab;
    document.querySelectorAll('.tab').forEach(function(t){t.classList.remove('active');});
    document.getElementById('tab-'+tab).classList.add('active');
    document.querySelectorAll('.card').forEach(function(c){
      c.style.display=c.dataset.category===tab?'':'none';
    });
    checkEmpty();
  }

  // ── Card actions ───────────────────────────────────────────────────────────
  function toggle(id){
    var d=document.getElementById('detail-'+id),m=document.getElementById('more-'+id);
    var open=d.style.display==='block';
    d.style.display=open?'none':'block';
    m.textContent=open?'More':'Less';
  }
  function dismiss(id){
    var c=document.getElementById('card-'+id);
    c.classList.add('dismissing');
    setTimeout(function(){
      fetch('/api/dismiss',{method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({id:id})})
        .then(function(){c.remove();updateCounts();checkEmpty();})
        .catch(function(){c.classList.remove('dismissing');});
    },200);
  }
  function snooze(id){
    var c=document.getElementById('card-'+id);
    c.classList.add('dismissing');
    setTimeout(function(){
      fetch('/api/snooze',{method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({id:id})})
        .then(function(){c.remove();updateCounts();checkEmpty();})
        .catch(function(){c.classList.remove('dismissing');});
    },200);
  }
  function openBrief(p){
    var btn=event.target;
    var orig=btn.textContent;
    btn.textContent='Opening\u2026';btn.disabled=true;
    fetch('/api/open-brief',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({path:p})})
    .then(function(r){
      if(r.ok){
        btn.textContent='\u2713 Opened';
        setTimeout(function(){btn.textContent=orig;btn.disabled=false;},2000);
      } else {
        btn.textContent='Not found';btn.style.color='#DC2626';
        setTimeout(function(){btn.textContent=orig;btn.style.color='';btn.disabled=false;},2500);
      }
    })
    .catch(function(){
      btn.textContent='Error';btn.style.color='#DC2626';
      setTimeout(function(){btn.textContent=orig;btn.style.color='';btn.disabled=false;},2500);
    });
  }
  function discuss(id,agent,headline,text){
    navigator.clipboard.writeText(text);
    var btn=document.getElementById('discuss-'+id);
    btn.textContent='Copied';btn.classList.add('copied');
    setTimeout(function(){btn.textContent='Discuss';btn.classList.remove('copied');},1800);
  }

  // ── UI helpers ─────────────────────────────────────────────────────────────
  function checkEmpty(){
    var vis=[...document.querySelectorAll('.card')].filter(function(c){
      return c.style.display!=='none';
    });
    var em=document.getElementById('empty-msg');
    if(vis.length===0){
      if(!em){
        var el=document.createElement('div');el.id='empty-msg';el.className='empty';
        el.textContent='Nothing here. Your agents are on it.';
        document.getElementById('list').appendChild(el);
      }
    } else if(em) em.remove();
  }
  function updateCounts(){
    TAB_IDS.forEach(function(tid,i){
      var c=[...document.querySelectorAll('.card')].filter(function(el){
        return el.dataset.category===tid;
      }).length;
      var el=document.getElementById('tab-'+tid);
      if(el) el.textContent=c?(TAB_NAMES[i]+' ('+c+')'):TAB_NAMES[i];
    });
  }

  // Auto-refresh every 2 minutes
  setTimeout(function(){location.reload();},120000);
</script></body></html>`;
}

// ── Server ─────────────────────────────────────────────────────────────────

function startServer(config, onReady) {
  const inbox      = config.inbox || path.join(os.homedir(), 'Documents', 'Claude', 'agent-inbox');
  const archive    = path.join(inbox, 'archived');
  const snoozed    = path.join(inbox, 'snoozed');
  const port       = config.port || 2626;
  const claudeBase = path.join(os.homedir(), 'Documents', 'Claude');

  fs.mkdirSync(inbox,   { recursive: true });
  fs.mkdirSync(archive, { recursive: true });
  fs.mkdirSync(snoozed, { recursive: true });

  const server = http.createServer((req, res) => {
    const url = req.url.split('?')[0];

    if (req.method === 'GET' && url === '/manifest.json') {
      const manifestPath = path.join(__dirname, 'manifest.json');
      const manifest = fs.existsSync(manifestPath) ? fs.readFileSync(manifestPath) : '{}';
      res.writeHead(200, { 'Content-Type': 'application/manifest+json' });
      res.end(manifest);
      return;
    }

    if (req.method === 'GET' && (url === '/' || url === '/index.html')) {
      const items = loadItems(inbox, snoozed);
      const html  = renderPage(items, config);
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(html);
      return;
    }

    if (req.method === 'POST') {
      let body = '';
      req.on('data', d => body += d);
      req.on('end', () => {
        let data = {};
        try { data = JSON.parse(body); } catch (e) {}

        if (url === '/api/dismiss') {
          const ok = dismissItem(inbox, archive, data.id || '');
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok }));
          return;
        }
        if (url === '/api/snooze') {
          const ok = snoozeItem(inbox, snoozed, data.id || '');
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok }));
          return;
        }
        if (url === '/api/archive-all') {
          const count = archiveAllDone(inbox, archive);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: true, archived: count }));
          return;
        }
        if (url === '/api/open-brief') {
          const briefPath = data.path || '';
          const resolved  = path.isAbsolute(briefPath)
            ? briefPath
            : path.join(claudeBase, briefPath);
          if (fs.existsSync(resolved)) {
            exec(`open "${resolved}" || open -t "${resolved}"`);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: true }));
          } else {
            res.writeHead(404, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: false, error: `path not found: ${resolved}` }));
          }
          return;
        }
      });
      return;
    }

    res.writeHead(404);
    res.end();
  });

  server.listen(port, '127.0.0.1', () => {
    if (onReady) onReady();
  });

  server.on('error', err => {
    if (err.code === 'EADDRINUSE') {
      console.error(`\n  Port ${port} is already in use. Is Station already running?\n`);
      process.exit(1);
    }
    throw err;
  });

  return server;
}

module.exports = { startServer };
