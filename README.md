# Real-Time Stock Ticker

A minimal demo application that shows real-time stock prices using Socket.io.

Features
- Server broadcasts simulated price updates every 2 seconds
- Client receives updates and shows price change and percentage

Requirements
- Node.js 16+ (or latest LTS)

Quick start

1. Install dependencies

```powershell
cd "c:\Users\vikra\Downloads\nan mudhalvan\project"
npm install
```

2. Start server

```powershell
npm start
```

3. Open http://localhost:3000 in your browser

Notes
- Prices are simulated locally. Replace the generator with a real data source/API for production.
- This is a small demo — secure, rate-limit and handle errors for a production-ready service.

api.txt configuration
---------------------
Place an `api.txt` file next to `server.js` to override initial symbols or provide optional settings. Example format:

```
SYMBOLS=AAPL,MSFT,GOOGL
PRICE_AAPL=175.50
```

Lines starting with `#` are ignored.

External APIs and deployment
----------------------------
- To enable live quotes from IEX Cloud or Polygon, provide keys via environment variables or `api.txt`:
	- `IEX_KEY=your_iex_token`
	- `POLYGON_KEY=your_polygon_key`
	- `NEWS_API_KEY=your_newsapi_key`

- The server exposes lightweight proxy endpoints:
	- `/api/quote?symbol=SYMBOL` — returns quote from provider or simulated fallback
	- `/api/news` — returns latest headlines or simulated feed

- Deploying: This app can run on Vercel (serverless functions) or Netlify, but the current server is an Express app. For Vercel/Netlify deploys, convert `server.js` endpoints into serverless functions or use a Node host (Render, Heroku). Alternatively, keep the static front-end on Vercel/Netlify and host the API on a small Node host.
