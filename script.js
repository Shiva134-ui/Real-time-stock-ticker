// 🔑 REPLACE WITH YOUR NEW ALPHA VANTAGE KEY
const API_KEY = 'Q1GW98ZIZ1A7DOK9';
const API_URL = 'https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=';

// State
let watchlist = ['AAPL', 'MSFT', 'GOOGL', 'TSLA', 'AMZN', 'NVDA', 'BTC'];
let isPaused = false;
let charts = {};
// Wallet & Portfolio State
let wallet = {
  balance: 10000.00,
  portfolio: {} // symbol -> { qty: number, avgPrice: number }
};
let currentMode = 'market'; // 'market' or 'portfolio'
let marketData = {}; // Cache for live prices: symbol -> { price, change, etc }

// DOM Elements
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
const walletBalanceEl = document.getElementById('walletBalance');
const portfolioPnLEl = document.getElementById('portfolioPnL');
const viewMarketBtn = document.getElementById('viewMarketBtn');
const viewPortfolioBtn = document.getElementById('viewPortfolioBtn');
const toastContainer = document.getElementById('toastContainer');

// Modal Elements
const stockModal = document.getElementById('stockModal');
const closeModalBtn = document.getElementById('closeModal');
const modalContent = document.getElementById('modalContent');


document.addEventListener('DOMContentLoaded', () => {
  loadData(); // Load wallet and watchlist
  updateWalletUI(); // Init wallet display
  setupListeners();

  // Initial Fetch
  updateAll();

  initParticles();
  initNewsFeed();

  // Auto-refresh every 60s
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

  pauseBtn.addEventListener('click', () => {
    isPaused = true;
    tickerEl.style.animationPlayState = 'paused';
    statusEl.innerHTML = '<span class="status-icon">⏸️</span> Paused live updates.';
    statusEl.classList.add('paused-text');
  });

  resumeBtn.addEventListener('click', () => {
    isPaused = false;
    tickerEl.style.animationPlayState = 'running';
    updateAll();
    statusEl.innerHTML = '<span class="status-icon">▶️</span> Resumed live updates.';
    statusEl.classList.remove('paused-text');
  });

  refreshBtn.addEventListener('click', () => {
    if (!isPaused) {
      statusEl.innerHTML = '<span class="status-icon">🔄</span> Refreshing...';
      updateAll();
    }
  });

  clearBtn.addEventListener('click', () => {
    if (confirm('Clear entire watchlist?')) {
      watchlist = [];
      saveData();
      updateViews(); // Clear grid
      statusEl.textContent = '🗑️ Watchlist cleared.';
    }
  });

  // Modal Listeners
  closeModalBtn.addEventListener('click', () => {
    stockModal.classList.remove('open');
  });

  window.addEventListener('click', (e) => {
    if (e.target === stockModal) {
      stockModal.classList.remove('open');
    }
  });

  // View Toggles
  viewMarketBtn.addEventListener('click', () => switchView('market'));
  viewPortfolioBtn.addEventListener('click', () => switchView('portfolio'));
}

/* ----------------------------------------------------
   VIEW & WALLET LOGIC
---------------------------------------------------- */
function switchView(mode) {
  currentMode = mode;
  viewMarketBtn.classList.toggle('active', mode === 'market');
  viewPortfolioBtn.classList.toggle('active', mode === 'portfolio');
  updateViews();
}

function updateWalletUI() {
  if (!walletBalanceEl) return;
  walletBalanceEl.textContent = `$${wallet.balance.toLocaleString('en-US', { minimumFractionDigits: 2 })}`;

  // Calculate PnL
  // To do this accurately, we need real-time prices.
  // We use cached data 'marketData' which is updated by updateAll()

  let unrealizedPnL = 0;

  Object.keys(wallet.portfolio).forEach(sym => {
    const position = wallet.portfolio[sym];
    const currentPrice = marketData[sym]?.price || position.avgPrice; // Fallback to cost if no live data
    const equity = position.qty * currentPrice;
    const cost = position.qty * position.avgPrice;
    unrealizedPnL += (equity - cost);
  });

  const isPos = unrealizedPnL >= 0;
  const pnlPercent = (wallet.balance > 0) ? (unrealizedPnL / 10000) * 100 : 0; // % Return on starting 10k logic

  if (portfolioPnLEl) {
    portfolioPnLEl.textContent = `${isPos ? '+' : ''}$${Math.abs(unrealizedPnL).toFixed(2)} (${isPos ? '+' : ''}${pnlPercent.toFixed(2)}%)`;
    portfolioPnLEl.style.color = isPos ? 'var(--up-color)' : 'var(--down-color)';
  }
}

function showToast(title, message, type = 'success') {
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `
    <div class="toast-icon">${type === 'success' ? '✅' : '⚠️'}</div>
    <div class="toast-content">
      <div class="toast-title">${title}</div>
      <div class="toast-msg">${message}</div>
    </div>
  `;
  toastContainer.appendChild(toast);

  setTimeout(() => {
    toast.classList.add('hiding');
    setTimeout(() => toast.remove(), 400);
  }, 4000);
}

/* ----------------------------------------------------
   TRADING ENGINE (Execute Trade)
---------------------------------------------------- */
function executeTrade(symbol, action, qty) {
  const data = marketData[symbol];
  if (!data) {
    showToast('Error', 'Market data unavailable.', 'error');
    return;
  }

  const price = data.price;
  const total = price * qty;

  if (action === 'buy') {
    if (wallet.balance >= total) {
      wallet.balance -= total;

      // Update Portfolio Logic
      if (!wallet.portfolio[symbol]) wallet.portfolio[symbol] = { qty: 0, avgPrice: 0 };
      const pos = wallet.portfolio[symbol];

      // Weighted Average Price
      const newTotalCost = (pos.qty * pos.avgPrice) + total;
      pos.qty += qty;
      pos.avgPrice = newTotalCost / pos.qty;

      saveData();
      showToast('Trade Executed', `Bought ${qty} ${symbol} @ $${price.toFixed(2)}`, 'success');
      updateWalletUI();
      if (currentMode === 'portfolio') updateViews(); // Refresh view
      closeModalBtn.click(); // Close modal
    } else {
      showToast('Insufficient Funds', 'You need more buying power.', 'error');
    }
  } else if (action === 'sell') {
    const pos = wallet.portfolio[symbol];
    if (pos && pos.qty >= qty) {
      wallet.balance += total;
      pos.qty -= qty;

      if (pos.qty === 0) delete wallet.portfolio[symbol];

      saveData();
      showToast('Trade Executed', `Sold ${qty} ${symbol} @ $${price.toFixed(2)}`, 'success');
      updateWalletUI();
      if (currentMode === 'portfolio') updateViews();
      closeModalBtn.click();
    } else {
      showToast('Invalid Trade', `You only own ${pos ? pos.qty : 0} shares.`, 'error');
    }
  }
}

/* ----------------------------------------------------
   DATA FETCHING & UPDATES
---------------------------------------------------- */
function addStock() {
  const symbol = stockInput.value.trim().toUpperCase();
  if (!symbol || !/^[A-Z]{1,5}$/.test(symbol)) {
    statusEl.textContent = '⚠️ Invalid symbol.';
    return;
  }
  if (watchlist.includes(symbol)) {
    statusEl.textContent = `ℹ️ ${symbol} already tracked.`;
    return;
  }
  watchlist.unshift(symbol);
  saveData();
  stockInput.value = '';
  updateAll();
  statusEl.textContent = `✅ Added ${symbol}.`;
}

function removeStock(symbol, event) {
  event.stopPropagation();
  const card = document.getElementById(`card-${symbol}`);
  if (card) {
    card.style.opacity = '0';
    setTimeout(() => {
      watchlist = watchlist.filter(s => s !== symbol);
      saveData();
      updateViews();
      statusEl.textContent = `🗑️ Removed ${symbol}.`;
    }, 300);
  }
}

async function fetchStockData(symbol) {
  try {
    const basePrice = Math.random() * 200 + 50;
    const change = (Math.random() - 0.5) * 5;
    const changePercent = (change / basePrice) * 100;

    // Determine user ownership
    // const owned = wallet.portfolio[symbol] ? wallet.portfolio[symbol].qty : 0;

    return {
      symbol,
      price: basePrice,
      change,
      changePercent,
      open: basePrice * (1 - (Math.random() * 0.02)),
      high: basePrice * 1.05,
      low: basePrice * 0.98,
      volume: Math.floor(Math.random() * 10000000),
      mktCap: (Math.random() * 2 + 0.5).toFixed(2) + 'T'
    };
  } catch (e) {
    console.error(e);
    return null;
  }
}

async function updateAll() {
  if (isPaused) return;

  // We need to fetch data for Watchlist items AND Portfolio items (if not in watchlist)
  // Combine unique symbols
  const portfolioSymbols = Object.keys(wallet.portfolio);
  const allSymbols = [...new Set([...watchlist, ...portfolioSymbols])];

  const results = await Promise.all(allSymbols.map(s => fetchStockData(s)));
  const valid = results.filter(Boolean);

  // Update Cache
  valid.forEach(data => { marketData[data.symbol] = data; });

  updateViews();
  updateWalletUI(); // Recalculate PnL with new prices
  statusEl.innerHTML = `✅ Updated at ${new Date().toLocaleTimeString()}`;
}

function updateViews() {
  // Determine which stocks to show
  const stocksToDisplay = currentMode === 'market'
    ? watchlist.map(s => marketData[s]).filter(Boolean)
    : Object.keys(wallet.portfolio).map(s => marketData[s]).filter(Boolean);

  // Update Ticker
  if (tickerEl) {
    tickerEl.innerHTML = '';
    const tickerItems = [...stocksToDisplay, ...stocksToDisplay];
    tickerItems.forEach(stock => {
      const li = document.createElement('li');
      li.className = 'ticker-item';
      const isPos = stock.change >= 0;
      li.innerHTML = `
        <span class="ticker-symbol">${stock.symbol}</span>
        <span class="ticker-price">$${stock.price.toFixed(2)}</span>
        <span class="ticker-change ${isPos ? 'positive' : 'negative'}">
          ${isPos ? '▲' : '▼'} ${Math.abs(stock.change).toFixed(2)}%
        </span>
      `;
      tickerEl.appendChild(li);
    });
  }

  // Watchlist Grid
  renderGrid(stocksToDisplay);
  if (watchlistCountEl) watchlistCountEl.textContent = stocksToDisplay.length;
}

function renderGrid(stocks) {
  // Sync grid with list
  // Remove missing
  const currentIds = stocks.map(s => `card-${s.symbol}`);
  [...watchlistGrid.children].forEach(child => {
    if (!currentIds.includes(child.id)) child.remove();
  });

  stocks.forEach(stock => {
    let card = document.getElementById(`card-${stock.symbol}`);
    const isPos = stock.change >= 0;

    // Specialized Content for Portfolio Mode
    let extraInfo = '';
    if (currentMode === 'portfolio') {
      const pos = wallet.portfolio[stock.symbol];
      const pnl = (stock.price - pos.avgPrice) * pos.qty;
      const isPnlPos = pnl >= 0;
      extraInfo = `
        <div style="margin-top: 8px; font-size: 0.85rem; color: var(--text-secondary); border-top: 1px solid rgba(255,255,255,0.1); padding-top: 8px;">
          <div>QTY: <strong>${pos.qty}</strong></div>
          <div>Avg: $${pos.avgPrice.toFixed(2)}</div>
          <div style="color: ${isPnlPos ? 'var(--up-color)' : 'var(--down-color)'}">
            PnL: ${isPnlPos ? '+' : ''}$${pnl.toFixed(2)}
          </div>
        </div>
      `;
    }

    if (!card) {
      card = createCard(stock, extraInfo);
      watchlistGrid.appendChild(card);
      renderChart(`chart-${stock.symbol}`, stock.price, isPos);
      setupTilt(card);
    } else {
      // Update
      const priceEl = card.querySelector('.stock-price');
      priceEl.textContent = `$${stock.price.toFixed(2)}`;

      const changeEl = card.querySelector('.stock-change');
      changeEl.className = `stock-change ${isPos ? 'positive' : 'negative'}`;
      changeEl.innerHTML = `${isPos ? '▲' : '▼'} ${Math.abs(stock.change).toFixed(2)} (${Math.abs(stock.changePercent).toFixed(2)}%)`;

      // Update extra info container if switching modes
      let extraEl = card.querySelector('.extra-info');
      // If mode switched and element doesn't exist, recreate card or append
      // Simpler to just update innerHTML if it exists, or create it.
      if (!extraEl) {
        extraEl = document.createElement('div');
        extraEl.className = 'extra-info';
        card.appendChild(extraEl);
      }
      extraEl.innerHTML = extraInfo;

      const chartId = `chart-${stock.symbol}`;
      renderChart(chartId, stock.price, isPos);
      card.dataset.fullData = JSON.stringify(stock);
    }
  });
}


function createCard(stock, extraInfo = '') {
  const isPos = stock.change >= 0;
  const card = document.createElement('div');
  card.className = 'stock-card';
  card.id = `card-${stock.symbol}`;
  card.dataset.fullData = JSON.stringify(stock);

  // Show remove button only in Market mode
  const removeBtnHtml = `<button class="remove-btn" title="Remove">✕</button>`;

  card.innerHTML = `
    <div class="stock-header">
      <div class="stock-symbol">${stock.symbol}</div>
      ${currentMode === 'market' ? removeBtnHtml : ''}
    </div>
    <div class="stock-price">$${stock.price.toFixed(2)}</div>
    <div class="stock-change ${isPos ? 'positive' : 'negative'}">
      ${isPos ? '▲' : '▼'} ${Math.abs(stock.change).toFixed(2)} (${Math.abs(stock.changePercent).toFixed(2)}%)
    </div>
    <div class="chart-container">
      <canvas id="chart-${stock.symbol}"></canvas>
    </div>
    <div class="extra-info">${extraInfo}</div>
  `;

  card.addEventListener('click', () => openModal(stock.symbol));

  // Attach listener only if button exists
  if (currentMode === 'market') {
    const btn = card.querySelector('.remove-btn');
    if (btn) btn.addEventListener('click', (e) => removeStock(stock.symbol, e));
  }

  return card;
}

/* ----------------------------------------------------
   MODAL WITH TRADING INTERFACE
---------------------------------------------------- */
function openModal(symbol) {
  const data = marketData[symbol];
  if (!data) return;
  const isPos = data.change >= 0;

  const owned = (wallet.portfolio[symbol]) ? wallet.portfolio[symbol].qty : 0;

  modalContent.innerHTML = `
    <div class="modal-header">
      <div class="modal-title">
        <h2>${data.symbol}</h2>
        <div class="modal-subtitle">Virtual Trading</div>
      </div>
      <div>
        <div class="modal-price-huge" style="color: ${isPos ? 'var(--up-color)' : 'var(--down-color)'}">
          $${data.price.toFixed(2)}
        </div>
        <div class="stock-change ${isPos ? 'positive' : 'negative'}" style="justify-content: flex-end">
           ${isPos ? '▲' : '▼'} ${Math.abs(data.change).toFixed(2)}%
        </div>
      </div>
    </div>

    <div class="modal-grid">
      <!-- Left: Chart & Stats -->
      <div class="">
        <div class="modal-chart-area">
          <canvas id="modalChart" height="200"></canvas>
        </div>
         <div class="stat-grid" style="margin-top:20px;">
          <div class="stat-box">
            <span class="stat-label">Your Shares</span>
            <div class="stat-value">${owned}</div>
          </div>
          <div class="stat-box">
            <span class="stat-label">Equity Value</span>
            <div class="stat-value">$${(owned * data.price).toFixed(2)}</div>
          </div>
          <div class="stat-box">
            <span class="stat-label">High</span>
            <div class="stat-value">$${data.high.toFixed(2)}</div>
          </div>
          <div class="stat-box">
            <span class="stat-label">Low</span>
            <div class="stat-value">$${data.low.toFixed(2)}</div>
          </div>
        </div>
      </div>

      <!-- Right: Buying Console -->
      <div class="glass-panel" style="padding: 24px;">
        <h3 style="margin-bottom: 16px;">Execute Trade</h3>
        
        <div class="trade-tabs">
          <div class="trade-tab active" id="buyTab">Buy</div>
          <div class="trade-tab" id="sellTab">Sell</div>
        </div>

        <div class="trade-input-group">
          <input type="number" id="tradeQty" class="trade-input" value="1" min="1">
          <span class="trade-input-label">Shares</span>
        </div>

        <div class="trade-summary">
          <span>Est. Total</span>
          <span class="trade-total" id="tradeTotal">$${data.price.toFixed(2)}</span>
        </div>
        
        <div class="trade-actions">
           <button class="trade-btn btn-buy" id="executeTradeBtn">BUY ${data.symbol}</button>
        </div>
        
        <div style="margin-top: 16px; font-size: 0.8rem; color: var(--text-muted); text-align: center;">
          Buying Power: $${wallet.balance.toLocaleString()}
        </div>
      </div>
    </div>
  `;

  stockModal.classList.add('open');

  // Modal Interactivity
  const qtyInput = document.getElementById('tradeQty');
  const totalEl = document.getElementById('tradeTotal');
  const executeBtn = document.getElementById('executeTradeBtn');
  const buyTab = document.getElementById('buyTab');
  const sellTab = document.getElementById('sellTab');
  let tradeAction = 'buy';

  if (qtyInput) {
    qtyInput.addEventListener('input', () => {
      const qty = parseInt(qtyInput.value) || 0;
      totalEl.textContent = `$${(qty * data.price).toFixed(2)}`;
    });
  }

  buyTab.addEventListener('click', () => {
    tradeAction = 'buy';
    buyTab.classList.add('active');
    sellTab.classList.remove('active');
    executeBtn.className = 'trade-btn btn-buy';
    executeBtn.textContent = `BUY ${data.symbol}`;
  });

  sellTab.addEventListener('click', () => {
    tradeAction = 'sell';
    sellTab.classList.add('active');
    buyTab.classList.remove('active');
    executeBtn.className = 'trade-btn btn-sell';
    executeBtn.textContent = `SELL ${data.symbol}`;
  });

  executeBtn.addEventListener('click', () => {
    const qty = parseInt(qtyInput.value);
    if (qty > 0) executeTrade(data.symbol, tradeAction, qty);
  });

  setTimeout(() => renderChart('modalChart', data.price, isPos, 50), 50);
}

/* ----------------------------------------------------
   3D TILT & PARTICLES & UTILS
   (Same as before, preserved)
---------------------------------------------------- */
function setupTilt(card) {
  card.addEventListener('mousemove', (e) => {
    const rect = card.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    card.style.setProperty('--mouse-x', `${(x / rect.width) * 100}%`);
    card.style.setProperty('--mouse-y', `${(y / rect.height) * 100}%`);

    const centerX = rect.width / 2;
    const centerY = rect.height / 2;
    const rotateX = ((y - centerY) / centerY) * -10;
    const rotateY = ((x - centerX) / centerX) * 10;

    card.style.transform = `perspective(1000px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) scale(1.02)`;
  });

  card.addEventListener('mouseleave', () => {
    card.style.transform = 'perspective(1000px) rotateX(0) rotateY(0) scale(1)';
  });
}

function initParticles() {
  const canvas = document.getElementById('particleCanvas');
  const ctx = canvas.getContext('2d');

  let width, height;
  let particles = [];

  function resize() {
    width = canvas.width = window.innerWidth;
    height = canvas.height = window.innerHeight;
  }

  window.addEventListener('resize', resize);
  resize();

  class Particle {
    constructor() {
      this.x = Math.random() * width;
      this.y = Math.random() * height;
      this.vx = (Math.random() - 0.5) * 0.5;
      this.vy = (Math.random() - 0.5) * 0.5;
      this.size = Math.random() * 2 + 0.5;
    }
    update() {
      this.x += this.vx;
      this.y += this.vy;
      if (this.x < 0 || this.x > width) this.vx *= -1;
      if (this.y < 0 || this.y > height) this.vy *= -1;
    }
    draw() {
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.15)';
      ctx.fill();
    }
  }

  for (let i = 0; i < 60; i++) particles.push(new Particle());

  function animate() {
    ctx.clearRect(0, 0, width, height);
    particles.forEach(p => {
      p.update();
      p.draw();
      particles.forEach(p2 => {
        const dx = p.x - p2.x;
        const dy = p.y - p2.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 150) {
          ctx.beginPath();
          ctx.strokeStyle = `rgba(100, 116, 139, ${0.1 - dist / 1500})`;
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(p2.x, p2.y);
          ctx.stroke();
        }
      });
    });
    requestAnimationFrame(animate);
  }
  animate();
}

function initNewsFeed() {
  const headlines = [
    "Fed Signals Potential Rate Cut in Late 2024",
    "Tech Sector Rallies as AI Demand Surges",
    "Oil Prices Dip Below $75/Barrel amid Supply Gluts",
    "Global Markets Eye Critical Jobs Report",
    "Crypto Markets Volatile as Regulations Loom"
  ];
  const displayHeadlines = [...headlines, ...headlines]; // Infinite
  newsTrack.innerHTML = displayHeadlines.map(h => `
    <div class="news-item">
      <span class="news-time">${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
      <strong>${h}</strong>
    </div>
  `).join('');
}

function renderChart(id, price, isPositive, dataPointsCount = 20) {
  const canvas = document.getElementById(id);
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  if (charts[id]) charts[id].destroy();

  const data = Array.from({ length: dataPointsCount }, (_, i) => {
    return price * (1 + (Math.random() - 0.5) * 0.1);
  });

  const gradient = ctx.createLinearGradient(0, 0, 0, 300);
  const color = isPositive ? '52, 211, 153' : '248, 113, 113';
  gradient.addColorStop(0, `rgba(${color}, 0.5)`);
  gradient.addColorStop(1, `rgba(${color}, 0.0)`);

  charts[id] = new Chart(ctx, {
    type: 'line',
    data: {
      labels: new Array(dataPointsCount).fill(''),
      datasets: [{
        data: data,
        borderColor: isPositive ? '#34d399' : '#f87171',
        backgroundColor: gradient,
        borderWidth: 2,
        fill: true,
        pointRadius: 0,
        pointHoverRadius: 6,
        tension: 0.4
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: { x: { display: false }, y: { display: false } },
      animation: { duration: 800 }
    }
  });
}

function saveData() {
  localStorage.setItem('watchlist', JSON.stringify(watchlist));
  localStorage.setItem('wallet', JSON.stringify(wallet));
}

function loadData() {
  const savedList = localStorage.getItem('watchlist');
  if (savedList) { try { watchlist = JSON.parse(savedList); } catch (e) { } }

  const savedWallet = localStorage.getItem('wallet');
  if (savedWallet) { try { wallet = JSON.parse(savedWallet); } catch (e) { } }
}

function updateCount() {
  if (watchlistCountEl) watchlistCountEl.textContent = watchlist.length;
}
