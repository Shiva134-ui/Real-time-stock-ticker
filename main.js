const socket = io();

// UI elements
const statusEl = document.getElementById('conn');
const stocksEl = document.getElementById('stocks');
const refreshBtn = document.getElementById('refresh');
const quickStats = document.getElementById('quickStats');

// tabs
document.querySelectorAll('.tabs button').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tabs button').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    const tab = btn.dataset.tab;
    document.querySelectorAll('.panel').forEach(p => p.classList.add('hidden'));
    document.getElementById(tab).classList.remove('hidden');
  });
});

// dark mode
const darkToggle = document.getElementById('darkToggle');
function setDark(on) {
  document.documentElement.classList.toggle('dark', on);
  darkToggle.setAttribute('aria-pressed', on ? 'true' : 'false');
  localStorage.setItem('dark', on ? '1' : '0');
}
darkToggle.addEventListener('click', () => setDark(!(localStorage.getItem('dark') === '1')));
if (localStorage.getItem('dark') === '1') setDark(true);

let lastPrices = {};
let priceHistory = {}; // symbol -> [ {t, price} ]

function renderSnapshot(list) {
  stocksEl.innerHTML = '';
  list.forEach(s => {
    lastPrices[s.symbol] = s.price;
    priceHistory[s.symbol] = priceHistory[s.symbol] || [];
    priceHistory[s.symbol].push({ t: Date.now(), price: s.price });

    const tr = document.createElement('tr');
    tr.className = 'ticker-row';
    tr.innerHTML = `<td>${s.symbol}</td><td data-symbol="${s.symbol}">${s.price.toFixed(2)}</td><td data-change="${s.symbol}">-</td><td><button data-add="${s.symbol}">Add to Portfolio</button></td>`;
    stocksEl.appendChild(tr);
  });

  // populate chart symbol select
  const sel = document.getElementById('chartSymbol');
  sel.innerHTML = '';
  list.forEach(s => {
    const opt = document.createElement('option'); opt.value = s.symbol; opt.textContent = s.symbol; sel.appendChild(opt);
  });
  updateQuickStats();
}

function applyUpdate(list) {
  list.forEach(s => {
    const priceCell = document.querySelector(`td[data-symbol="${s.symbol}"]`);
    const changeCell = document.querySelector(`td[data-change="${s.symbol}"]`);
    if (!priceCell) return;

    const old = lastPrices[s.symbol] ?? s.price;
    const newP = s.price;
    const diff = +(newP - old).toFixed(2);
    const pct = old ? +((diff / old) * 100).toFixed(2) : 0;

    priceCell.textContent = newP.toFixed(2);
    changeCell.textContent = `${diff >= 0 ? '+' : ''}${diff.toFixed(2)} (${pct}% )`;

    changeCell.classList.remove('up', 'down', 'neutral');
    if (diff > 0) changeCell.classList.add('up');
    else if (diff < 0) changeCell.classList.add('down');
    else changeCell.classList.add('neutral');

    // flash row
    const row = priceCell.parentElement;
    row.classList.add('flash');
    setTimeout(() => row.classList.remove('flash'), 350);

    lastPrices[s.symbol] = newP;
    priceHistory[s.symbol] = priceHistory[s.symbol] || [];
    priceHistory[s.symbol].push({ t: Date.now(), price: newP });
    // keep history reasonable
    if (priceHistory[s.symbol].length > 200) priceHistory[s.symbol].shift();
  });

  updateChartIfNeeded();
  updateQuickStats();
  renderPortfolio();
}

socket.on('connect', () => { statusEl.textContent = 'connected'; });
socket.on('disconnect', () => { statusEl.textContent = 'disconnected'; });
socket.on('snapshot', (list) => { renderSnapshot(list); });
socket.on('update', (list) => { applyUpdate(list); });

refreshBtn.addEventListener('click', () => { socket.emit('refresh'); });

// Chart
const ctx = document.getElementById('priceChart').getContext('2d');
let chart = new Chart(ctx, {
  type: 'line',
  data: { labels: [], datasets: [] },
  options: {
    responsive: true,
    normalized: true,
    interaction: { mode: 'index', intersect: false },
    scales: { x: { type: 'time', time: { unit: 'second' } }, y: { beginAtZero: false } }
  }
});

const chartSymbolSel = document.getElementById('chartSymbol');
chartSymbolSel.addEventListener('change', () => updateChart(chartSymbolSel.value));
document.getElementById('chartZoom').addEventListener('click', () => { chart.resetZoom && chart.resetZoom(); });

function updateChartIfNeeded() {
  const sym = chartSymbolSel.value;
  if (sym) updateChart(sym);
}

function updateChart(sym) {
  const hist = (priceHistory[sym] || []).slice(-100);
  chart.data.labels = hist.map(p => p.t);
  chart.data.datasets = [{ label: sym, data: hist.map(p => ({ x: p.t, y: p.price })), borderColor: '#2196f3', tension: 0.15 }];
  chart.update('none');
  document.getElementById('chartMeta').textContent = sym + ' — points: ' + hist.length;
}

// Portfolio
function loadPortfolio() {
  try { return JSON.parse(localStorage.getItem('portfolio') || '{}'); } catch { return {}; }
}
function savePortfolio(p) { localStorage.setItem('portfolio', JSON.stringify(p)); }

function renderPortfolio() {
  const p = loadPortfolio();
  const root = document.getElementById('portfolioList');
  root.innerHTML = '';
  let total = 0;
  for (const sym of Object.keys(p)) {
    const shares = p[sym];
    const price = lastPrices[sym] || 0;
    const val = +(shares * price).toFixed(2);
    total += val;
    const el = document.createElement('div');
    el.className = 'position';
    el.innerHTML = `<strong>${sym}</strong>: ${shares} shares @ ${price.toFixed(2)} = $${val.toFixed(2)} <button data-remove="${sym}">Remove</button>`;
    root.appendChild(el);
  }
  document.getElementById('portfolioSummary').textContent = 'Total value: $' + total.toFixed(2);
}

document.getElementById('addPosition').addEventListener('submit', (ev) => {
  ev.preventDefault();
  const sym = document.getElementById('posSymbol').value.trim().toUpperCase();
  const shares = Number(document.getElementById('posShares').value);
  if (!sym || !shares) return;
  const p = loadPortfolio(); p[sym] = (p[sym] || 0) + shares; savePortfolio(p);
  document.getElementById('posSymbol').value = '';
  document.getElementById('posShares').value = '';
  renderPortfolio();
});

document.body.addEventListener('click', (ev) => {
  const add = ev.target.getAttribute && ev.target.getAttribute('data-add');
  if (add) {
    const p = loadPortfolio(); p[add] = (p[add] || 0) + 1; savePortfolio(p); renderPortfolio();
  }
  const rem = ev.target.getAttribute && ev.target.getAttribute('data-remove');
  if (rem) {
    const p = loadPortfolio(); delete p[rem]; savePortfolio(p); renderPortfolio();
  }
});

// quick stats
function updateQuickStats() {
  const keys = Object.keys(lastPrices);
  if (!keys.length) { quickStats.textContent = '—'; return; }
  const sum = keys.reduce((s,k)=> s + lastPrices[k], 0);
  quickStats.textContent = `Tracked: ${keys.length} • Avg price: $${(sum/keys.length).toFixed(2)}`;
}

// initial portfolio render
renderPortfolio();

// News feed
async function fetchNews() {
  try {
    const r = await fetch('/api/news');
    const j = await r.json();
    const list = j.data || [];
    const root = document.getElementById('newsFeed');
    root.innerHTML = '';
    list.forEach(item => {
      const el = document.createElement('div');
      el.className = 'news-item';
      el.innerHTML = `<strong>${item.title}</strong> <div class="muted">${item.source && item.source.name ? item.source.name : ''}</div>`;
      root.appendChild(el);
    });
  } catch (e) {
    document.getElementById('newsFeed').textContent = 'Failed to load news';
  }
}
fetchNews();

// Alerts
function loadAlerts() { try { return JSON.parse(localStorage.getItem('alerts') || '[]'); } catch { return []; } }
function saveAlerts(a) { localStorage.setItem('alerts', JSON.stringify(a)); }

function renderAlerts() {
  const root = document.getElementById('alertList'); root.innerHTML = '';
  const alerts = loadAlerts();
  alerts.forEach((al, i) => {
    const el = document.createElement('div'); el.className = 'alert-item';
    el.innerHTML = `<strong>${al.symbol}</strong> ${al.direction || 'at'} ${al.price} <button data-alert-remove="${i}">Remove</button>`;
    root.appendChild(el);
  });
}
renderAlerts();

document.getElementById('addAlert').addEventListener('submit', (ev) => {
  ev.preventDefault();
  const sym = document.getElementById('alertSymbol').value.trim().toUpperCase();
  const price = parseFloat(document.getElementById('alertPrice').value);
  if (!sym || !price) return;
  const a = loadAlerts(); a.push({ symbol: sym, price }); saveAlerts(a); renderAlerts();
  document.getElementById('alertSymbol').value = ''; document.getElementById('alertPrice').value = '';
});

document.body.addEventListener('click', (ev) => {
  const rem = ev.target.getAttribute && ev.target.getAttribute('data-alert-remove');
  if (rem != null) {
    const idx = Number(rem);
    const a = loadAlerts(); a.splice(idx,1); saveAlerts(a); renderAlerts();
  }
});

function checkAlerts() {
  const alerts = loadAlerts();
  alerts.forEach(al => {
    const p = lastPrices[al.symbol];
    if (!p) return;
    if ((p >= al.price) && !al.triggered) {
      // notify
      if (window.Notification && Notification.permission === 'granted') {
        new Notification(`Alert: ${al.symbol}`, { body: `${al.symbol} reached ${p}` });
      } else {
        console.log('Alert:', al.symbol, p);
      }
      al.triggered = true;
    }
  });
  saveAlerts(alerts);
}

// request notification permission
if (window.Notification && Notification.permission !== 'granted') Notification.requestPermission();

// check alerts whenever prices update
const origApplyUpdate = applyUpdate;
applyUpdate = function(list){ origApplyUpdate(list); checkAlerts(); };
