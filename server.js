const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const fs = require('fs');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

app.use(express.static('public'));

// Load optional api.txt configuration (key=value lines)
function loadApiConfig() {
  const p = path.join(__dirname, 'api.txt');
  if (!fs.existsSync(p)) return {};
  const raw = fs.readFileSync(p, 'utf8');
  const lines = raw.split(/\r?\n/);
  const config = {};
  for (let line of lines) {
    line = line.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    const val = line.slice(eq + 1).trim();
    config[key] = val;
  }
  return config;
}

const apiConfig = loadApiConfig();
console.log('api config:', apiConfig);

// optional http client for proxying requests to external APIs
const axios = require('axios');

// Helper: check if we have provider keys
const IEX_KEY = process.env.IEX_KEY || apiConfig.IEX_KEY;
const POLYGON_KEY = process.env.POLYGON_KEY || apiConfig.POLYGON_KEY;

// Simple proxy endpoint to fetch latest quote from configured provider or fallback to simulated data
app.get('/api/quote', async (req, res) => {
  const symbol = (req.query.symbol || '').toUpperCase();
  if (!symbol) return res.status(400).json({ error: 'symbol required' });

  // Try IEX Cloud
  if (IEX_KEY) {
    try {
      const r = await axios.get(`https://cloud.iexapis.com/stable/stock/${encodeURIComponent(symbol)}/quote`, { params: { token: IEX_KEY } });
      return res.json({ provider: 'iex', data: r.data });
    } catch (e) {
      console.warn('IEX fetch failed', e.message);
    }
  }

  // Try Polygon
  if (POLYGON_KEY) {
    try {
      const r = await axios.get(`https://api.polygon.io/v1/last/stocks/${encodeURIComponent(symbol)}`, { params: { apiKey: POLYGON_KEY } });
      return res.json({ provider: 'polygon', data: r.data });
    } catch (e) {
      console.warn('Polygon fetch failed', e.message);
    }
  }

  // Fallback to local simulated price
  const found = stocks.find(s => s.symbol === symbol);
  if (found) return res.json({ provider: 'sim', data: { symbol: found.symbol, price: found.price } });
  return res.status(404).json({ error: 'symbol not found' });
});

// Simple news endpoint (if NEWS_API_KEY set, query a news provider) otherwise return simulated headlines
const NEWS_API_KEY = process.env.NEWS_API_KEY || apiConfig.NEWS_API_KEY;
app.get('/api/news', async (req, res) => {
  if (NEWS_API_KEY) {
    try {
      // Example using NewsAPI.org
      const r = await axios.get('https://newsapi.org/v2/top-headlines', { params: { apiKey: NEWS_API_KEY, category: 'business', language: 'en', pageSize: 10 } });
      return res.json({ provider: 'newsapi', data: r.data.articles });
    } catch (e) {
      console.warn('News fetch failed', e.message);
    }
  }
  // fallback simulated headlines
  const headlines = [
    { title: 'Markets mixed as tech stocks lead gains', source: { name: 'Simulated Feed' } },
    { title: 'Economic data shows steady growth', source: { name: 'Simulated Feed' } },
  ];
  res.json({ provider: 'sim', data: headlines });
});

// Simple in-memory list of stocks and random generator
// default stock list. If apiConfig.SYMBOLS is present (comma-separated), use that instead.
let stocks = [
  { symbol: 'AAPL', price: 175.5 },
  { symbol: 'GOOGL', price: 135.25 },
  { symbol: 'MSFT', price: 330.1 },
  { symbol: 'AMZN', price: 140.0 },
  { symbol: 'TSLA', price: 265.8 },
];

if (apiConfig.SYMBOLS) {
  const syms = apiConfig.SYMBOLS.split(',').map(s => s.trim()).filter(Boolean);
  if (syms.length) {
    stocks = syms.map(sym => {
      const priceKey = `PRICE_${sym}`;
      const p = apiConfig[priceKey] ? Number(apiConfig[priceKey]) : +(100 + Math.random() * 300).toFixed(2);
      return { symbol: sym, price: p };
    });
  }
}

function randomDelta() {
  // small percent change between -1% and +1%
  return (Math.random() * 2 - 1) / 100;
}

function updatePrices() {
  stocks.forEach(s => {
    const delta = randomDelta();
    s.price = +(s.price * (1 + delta)).toFixed(2);
  });
}

io.on('connection', (socket) => {
  console.log('client connected:', socket.id);

  // send initial snapshot
  socket.emit('snapshot', stocks);

  // client can request an on-demand refresh
  socket.on('refresh', () => {
    socket.emit('snapshot', stocks);
  });

  socket.on('disconnect', () => {
    console.log('client disconnected:', socket.id);
  });
});

// broadcast updates every 2 seconds
setInterval(() => {
  updatePrices();
  io.emit('update', stocks);
}, 2000);

server.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});
