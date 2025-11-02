// 🔑 REPLACE WITH YOUR NEW ALPHA VANTAGE KEY
const API_KEY = 'Q1GW98ZIZ1A7DOK9'; 
const API_URL = 'https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=';

let watchlist = ['AAPL', 'MSFT', 'GOOGL'];
let isPaused = false;
let charts = {};

const stockInput = document.getElementById('stockInput');
const addStockBtn = document.getElementById('addStockBtn');
const tickerEl = document.getElementById('ticker');
const watchlistGrid = document.getElementById('watchlistGrid');
const statusEl = document.getElementById('status');
const watchlistCountEl = document.getElementById('watchlistCount');
const themeToggle = document.getElementById('themeToggle');
const pauseBtn = document.getElementById('pauseBtn');
const resumeBtn = document.getElementById('resumeBtn');
const refreshBtn = document.getElementById('refreshBtn');
const clearBtn = document.getElementById('clearBtn');

document.addEventListener('DOMContentLoaded', () => {
  loadWatchlist();
  updateCount();
  setupListeners();
  updateAll();
  setInterval(() => {
    if (!isPaused) updateAll();
  }, 60000);
});

themeToggle.addEventListener('click', () => {
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  const newTheme = isDark ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', newTheme);
  localStorage.setItem('theme', newTheme);
  themeToggle.querySelector('.icon').textContent = isDark ? '☀️' : '🌙';
});

const savedTheme = localStorage.getItem('theme') || 'dark';
document.documentElement.setAttribute('data-theme', savedTheme);
themeToggle.querySelector('.icon').textContent = savedTheme === 'dark' ? '🌙' : '☀️';

function setupListeners() {
  addStockBtn.addEventListener('click', addStock);
  stockInput.addEventListener('keypress', e => e.key === 'Enter' && addStock());
  pauseBtn.addEventListener('click', () => { isPaused = true; tickerEl.style.animationPlayState = 'paused'; statusEl.textContent = '⏸️ Paused.'; });
  resumeBtn.addEventListener('click', () => { isPaused = false; tickerEl.style.animationPlayState = 'running'; updateAll(); statusEl.textContent = '▶️ Resumed.'; });
  refreshBtn.addEventListener('click', () => !isPaused && updateAll());
  clearBtn.addEventListener('click', () => {
    if (confirm('Clear watchlist?')) {
      watchlist = [];
      saveWatchlist();
      updateCount();
      updateViews([], []);
      statusEl.textContent = '🗑️ Cleared.';
    }
  });
}

function addStock() {
  const symbol = stockInput.value.trim().toUpperCase();
  if (!symbol || !/^[A-Z]{1,5}$/.test(symbol)) {
    statusEl.textContent = '⚠️ Invalid symbol (1-5 letters).';
    return;
  }
  if (watchlist.includes(symbol)) {
    statusEl.textContent = `ℹ️ ${symbol} already added.`;
    stockInput.value = '';
    return;
  }
  if (watchlist.length >= 10) {
    statusEl.textContent = '⚠️ Max 10 stocks.';
    return;
  }
  watchlist.push(symbol);
  saveWatchlist();
  stockInput.value = '';
  updateCount();
  updateAll();
  statusEl.textContent = `✅ Added ${symbol}.`;
}

function removeStock(symbol) {
  watchlist = watchlist.filter(s => s !== symbol);
  saveWatchlist();
  updateCount();
  updateAll();
  statusEl.textContent = `🗑️ Removed ${symbol}.`;
}

async function fetchStockData(symbol) {
  try {
    const response = await fetch(
      `https://finnhub.io/api/v1/quote?symbol=${symbol}&token=d43otvpr01qge0cur6rgd43otvpr01qge0cur6s0`
    );
    const data = await response.json();
    if (data.c) {
      const price = data.c;
      const change = price - data.pc;
      const changePercent = (change / data.pc) * 100;
      return { symbol, price, change, changePercent };
    }
    return null;
  } catch (e) {
    console.error(e);
    return null;
  }
}

async function updateAll() {
  if (isPaused) return;
  statusEl.textContent = '🔄 Updating...';
  const results = await Promise.all(watchlist.map(fetchStockData));
  const valid = results.filter(Boolean);
  if (valid.length === 0) {
    statusEl.textContent = '❌ No data. Check key & symbols.';
    return;
  }
  updateViews(valid, valid);
  statusEl.textContent = `✅ Updated at ${new Date().toLocaleTimeString()}`;
}

function updateViews(tickerStocks, watchlistStocks) {
  // Ticker
  tickerEl.innerHTML = '';
  const tickerItems = [...tickerStocks, ...tickerStocks];
  tickerItems.forEach(stock => {
    const li = document.createElement('li');
    li.className = 'ticker-item';
    const isPos = stock.change >= 0;
    li.innerHTML = `
      <span class="ticker-symbol">${stock.symbol}</span>
      <span class="ticker-price">$${stock.price.toFixed(2)}</span>
      <span class="ticker-change ${isPos ? 'positive' : 'negative'}">
        ${isPos ? '▲' : '▼'} ${Math.abs(stock.change).toFixed(2)} (${Math.abs(stock.changePercent).toFixed(2)}%)
      </span>
    `;
    tickerEl.appendChild(li);
  });

  // Watchlist
  watchlistGrid.innerHTML = '';
  watchlistStocks.forEach(stock => {
    const isPos = stock.change >= 0;
    const card = document.createElement('div');
    card.className = 'stock-card';
    card.setAttribute('role', 'listitem');
    card.innerHTML = `
      <div class="stock-header">
        <div class="stock-symbol">${stock.symbol}</div>
        <button class="remove-btn" title="Remove ${stock.symbol}">⨯</button>
      </div>
      <div class="stock-price">$${stock.price.toFixed(2)}</div>
      <div class="stock-change ${isPos ? 'positive' : 'negative'}">
        ${isPos ? '▲' : '▼'} ${Math.abs(stock.change).toFixed(2)} (${Math.abs(stock.changePercent).toFixed(2)}%)
      </div>
      <div class="chart-container">
        <canvas id="chart-${stock.symbol}"></canvas>
      </div>
    `;
    watchlistGrid.appendChild(card);
    card.querySelector('.remove-btn').addEventListener('click', () => removeStock(stock.symbol));
    renderChart(`chart-${stock.symbol}`, stock.price, isPos);
  });
}

function renderChart(id, price, isPositive) {
  const canvas = document.getElementById(id);
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  
  // Generate mock price data
  const data = Array.from({length: 12}, (_, i) => {
    const prev = i > 0 ? data[i-1] : price;
    return prev * (1 + (Math.random() - 0.5) * 0.08);
  });

  // Destroy existing chart
  if (charts[id]) charts[id].destroy();

  // Create new chart
  charts[id] = new Chart(ctx, {
    type: 'line',
    data: {  // ✅ 'data' property was missing!
      labels: data.map(() => ''),
      datasets: [{
        data: data,
        borderColor: isPositive ? '#34d399' : '#f87171',
        backgroundColor: isPositive ? 'rgba(52,211,153,0.1)' : 'rgba(248,113,113,0.1)',
        borderWidth: 2,
        fill: true,
        pointRadius: 0,
        tension: 0.4
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { display: false },
        y: { display: false }
      }
    }
  });
}

function saveWatchlist() {
  localStorage.setItem('watchlist', JSON.stringify(watchlist));
}

function loadWatchlist() {
  const saved = localStorage.getItem('watchlist');
  if (saved) watchlist = JSON.parse(saved);
}

function updateCount() {
  watchlistCountEl.textContent = watchlist.length;
}