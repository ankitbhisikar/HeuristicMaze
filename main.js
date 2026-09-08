// ── Feed animation ──────────────────────────────────────────────

const events = [
  { ts: '14:02:11', badge: 'alert', cls: 'badge-alert', text: '<b>checkout-api</b> latency p99 above threshold' },
  { ts: '14:02:14', badge: 'route', cls: 'badge-route', text: 'owner resolved → <b>@priya</b>' },
  { ts: '14:02:52', badge: 'ok',    cls: 'badge-ok',    text: '<b>@priya</b> acknowledged' },
  { ts: '14:04:30', badge: 'route', cls: 'badge-route', text: 'rollback triggered on <b>checkout-api</b>' },
  { ts: '14:07:18', badge: 'ok',    cls: 'badge-ok',    text: 'latency back under threshold' },
  { ts: '14:07:19', badge: 'ok',    cls: 'badge-ok',    text: 'incident <b>#4821</b> resolved · 5m 08s' },
  { ts: '14:19:44', badge: 'alert', cls: 'badge-alert', text: '<b>auth-service</b> error rate spike' },
  { ts: '14:19:47', badge: 'route', cls: 'badge-route', text: 'owner resolved → <b>@marcus</b>' },
  { ts: '14:20:21', badge: 'ok',    cls: 'badge-ok',    text: '<b>@marcus</b> acknowledged' },
];

const feedBody = document.getElementById('feedBody');
let i = 0;
const maxRows = 7;

function addRow() {
  const e = events[i % events.length];
  const row = document.createElement('div');
  row.className = 'feed-row';
  row.innerHTML = `
    <span class="feed-ts mono">${e.ts}</span>
    <span class="feed-badge ${e.cls}">${e.badge}</span>
    <span class="feed-text">${e.text}</span>
  `;
  feedBody.appendChild(row);
  while (feedBody.children.length > maxRows) {
    feedBody.removeChild(feedBody.firstChild);
  }
  i++;
}

for (let n = 0; n < 5; n++) addRow();

const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
if (!prefersReduced) {
  setInterval(addRow, 2600);
}
