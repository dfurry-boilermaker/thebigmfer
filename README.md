# Stock Competition Tracker

Real-time stock competition tracker with YTD performance, interactive charts, and manager analyses.

**Live Demo:** https://thebigmotherfucker.com

## Quick Start

1. **Install dependencies**
   ```bash
   npm install
   ```

2. **Configure participants**
   - Copy `managers.json.example` to `managers.json`
   - Edit with your participants:
   ```json
   [
     {
       "name": "Participant Name",
       "stockSymbol": "AAPL",
       "analysis": "Investment thesis here"
     }
   ]
   ```

3. **Run locally**
   ```bash
   npm start
   # Visit http://localhost:3000
   ```

## Configuration

**Custom Colors**: Edit `public/app.js` and add to `managerColors`:
```javascript
const managerColors = {
    'Greg': '#8B4513',
    // Add more as needed
};
```

**Change Competition Year**: Edit `api/utils.js` and update `BASELINE_DATE`:
```javascript
const BASELINE_DATE = new Date('2025-12-31'); // Change year
```

## Deployment

**Vercel** (recommended):
```bash
npm i -g vercel
vercel
```

Optional: Set `EDGE_CONFIG` env var for caching. Add cron job for `/api/cron/refresh-cache` (every 15 min during market hours).

**Other Platforms**: Deploy to any Node.js 14+ hosting (Heroku, Railway, etc.)

## How It Works

- **Data Source**: Yahoo Finance API (via `yahoo-finance2`, no API key needed)
- **Caching**: In-memory + optional Edge Config
- **YTD Calculation**: Price appreciation + dividends from Dec 31 baseline
- **Trading Days**: Automatically filters weekends/holidays and removes gaps

## Customization

- **Styling**: Edit `public/styles.css`
- **Benchmarks**: Edit `api/indexes.js`
- **Chart**: Modify `renderChart()` in `public/app.js`

## Troubleshooting

- **Blank site**: Check browser console, verify `managers.json` is valid JSON, ensure stock symbols are valid
- **Data not updating**: Verify market hours, check cron job (if deployed), clear cache
- **Server issues**: Check Node.js version (14+), ensure port 3000 is free

## Project Structure

```
├── api/              # Serverless functions
├── public/           # Frontend (app.js, styles.css, index.html)
├── server.js         # Local dev server
├── managers.json     # Participants config
└── vercel.json       # Vercel config
```

---

**Happy Trading! 📈**
