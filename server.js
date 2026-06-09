const express = require('express');
const path = require('path');
const fs = require('fs');
const {
    CACHE_KEYS,
    getCachedData,
    setCachedData,
    isStale,
    markRefreshed,
    fetchWithTimeout,
    fetchQuotesBatched,
    isMarketOpen,
    loadManagersFromConfig,
    getBaselinePrices,
    getHistoricalPrice,
    getYTDDividends,
    ytdInterval,
    yahooFinance
} = require('./api/utils');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static('public'));

app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
    next();
});

// Inline refresh logic for local dev (same as cron but called directly)
async function refreshAllData() {
    const managers = loadManagersFromConfig();
    const symbols = managers.map(m => m.stockSymbol);

    console.log('Refreshing all data...');
    const start = Date.now();

    try {
        const [quotes, baselinePrices] = await Promise.all([
            fetchQuotesBatched(symbols, 8000),
            getBaselinePrices(symbols)
        ]);

        const quoteMap = {};
        quotes.forEach(q => { if (q) quoteMap[q.symbol] = q; });

        const today = new Date();
        const yearStart = new Date(2026, 0, 1);
        const daysSinceStart = Math.floor((today - yearStart) / (1000 * 60 * 60 * 24));

        // Parallel: dividends
        const divResults = await Promise.allSettled(
            managers.map((m, i) => getYTDDividends(m.stockSymbol, baselinePrices[i], 5000))
        );
        const dividends = divResults.map(r => r.status === 'fulfilled' ? r.value : 0);

        // Parallel: 1m prices
        let oneMonthPrices = new Array(symbols.length).fill(null);
        if (daysSinceStart >= 30) {
            const d = new Date(today); d.setDate(d.getDate() - 30);
            const results = await Promise.allSettled(
                symbols.map(s => getHistoricalPrice(s, d.toISOString().split('T')[0], 5000))
            );
            oneMonthPrices = results.map(r => r.status === 'fulfilled' ? r.value : null);
        }

        // Parallel: 3m prices
        let threeMonthPrices = new Array(symbols.length).fill(null);
        if (daysSinceStart >= 90) {
            const d = new Date(today); d.setDate(d.getDate() - 90);
            const results = await Promise.allSettled(
                symbols.map(s => getHistoricalPrice(s, d.toISOString().split('T')[0], 5000))
            );
            threeMonthPrices = results.map(r => r.status === 'fulfilled' ? r.value : null);
        }

        // Build current data
        const currentResults = managers.map((manager, i) => {
            const symbol = manager.stockSymbol;
            const quote = quoteMap[symbol];
            const baseline = baselinePrices[i];

            if (!quote || !baseline) {
                return { name: manager.name, symbol, currentPrice: 0, changePercent: null, change1d: null, change1m: null, change3m: null, analysis: manager.analysis || null };
            }

            const currentPrice = quote.regularMarketPrice || quote.price || quote.regularMarketPreviousClose || 0;
            const previousClose = quote.regularMarketPreviousClose || baseline;
            const ytdPriceChange = baseline > 0 ? ((currentPrice - baseline) / baseline) * 100 : 0;
            const ytdChange = ytdPriceChange + dividends[i];

            let change1d = previousClose > 0 ? ((currentPrice - previousClose) / previousClose) * 100 : null;
            let change1m = oneMonthPrices[i] && oneMonthPrices[i] > 0 ? ((currentPrice - oneMonthPrices[i]) / oneMonthPrices[i]) * 100 : null;
            let change3m = threeMonthPrices[i] && threeMonthPrices[i] > 0 ? ((currentPrice - threeMonthPrices[i]) / threeMonthPrices[i]) * 100 : null;

            return { name: manager.name, symbol, currentPrice, changePercent: ytdChange, change1d, change1m, change3m, analysis: manager.analysis || null };
        });

        currentResults.sort((a, b) => (b.changePercent || -Infinity) - (a.changePercent || -Infinity));
        await setCachedData(CACHE_KEYS.CURRENT, currentResults, 1800);
        await markRefreshed(CACHE_KEYS.CURRENT);

        // Monthly chart data
        const todayEnd = new Date(today); todayEnd.setHours(23, 59, 59, 999);
        const firstTradingDay = new Date(2026, 0, 2);
        const currentMonth = today.getMonth();
        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        const monthLabels = [];
        for (let i = 0; i < currentMonth; i++) monthLabels.push(months[i]);
        monthLabels.push(`${months[currentMonth]} ${today.getDate()}`);

        const interval = ytdInterval(currentMonth);
        const histResults = await Promise.allSettled(
            symbols.map(symbol =>
                fetchWithTimeout(() =>
                    yahooFinance.historical(symbol, {
                        period1: Math.floor(firstTradingDay.getTime() / 1000),
                        period2: Math.floor(todayEnd.getTime() / 1000),
                        interval
                    }), 10000
                )
            )
        );

        const stockData = managers.map((manager, i) => {
            const baseline = baselinePrices[i];
            if (!baseline || histResults[i].status !== 'fulfilled' || !histResults[i].value) {
                return { name: manager.name, symbol: manager.stockSymbol, data: [], timestamps: [] };
            }
            const history = histResults[i].value;
            if (!Array.isArray(history) || history.length === 0) {
                return { name: manager.name, symbol: manager.stockSymbol, data: [], timestamps: [] };
            }
            history.sort((a, b) => new Date(a.date) - new Date(b.date));
            const data = [], timestamps = [];
            for (const entry of history) {
                if (entry.close === null) continue;
                const d = entry.date instanceof Date ? entry.date : new Date(entry.date);
                data.push(((entry.close - baseline) / baseline) * 100);
                timestamps.push(d.getTime());
            }
            return { name: manager.name, symbol: manager.stockSymbol, data, timestamps };
        }).filter(s => s.data.length > 0);

        if (stockData.length > 0) {
            await setCachedData(CACHE_KEYS.MONTHLY, { months: monthLabels, data: stockData }, 1800);
            await markRefreshed(CACHE_KEYS.MONTHLY);
        }

        // Index data
        const indexDefs = [
            { symbol: 'SPY', name: 'S&P 500' },
            { symbol: 'QQQ', name: 'Nasdaq 100' },
            { symbol: 'DIA', name: 'Dow Jones' },
            { symbol: 'DX-Y.NYB', name: 'US Dollar' }
        ];
        const indexSymbols = indexDefs.map(i => i.symbol);
        const [indexQuotes, indexBaselines] = await Promise.all([
            fetchQuotesBatched(indexSymbols, 5000),
            getBaselinePrices(indexSymbols)
        ]);
        const indexQuoteMap = {};
        indexQuotes.forEach(q => { if (q) indexQuoteMap[q.symbol] = q; });

        const indexResults = indexDefs.map((idx, i) => {
            const q = indexQuoteMap[idx.symbol];
            const bl = indexBaselines[i];
            if (!q || !bl) return { symbol: idx.symbol, name: idx.name, currentPrice: null, changePercent: null, change1d: null };
            const price = q.regularMarketPrice || q.price || q.regularMarketPreviousClose || 0;
            const prevClose = q.regularMarketPreviousClose || bl;
            return {
                symbol: idx.symbol,
                name: idx.name,
                currentPrice: price,
                changePercent: bl > 0 ? ((price - bl) / bl) * 100 : 0,
                change1d: prevClose > 0 ? ((price - prevClose) / prevClose) * 100 : null
            };
        });
        await setCachedData(CACHE_KEYS.INDEXES, indexResults, 900);
        await markRefreshed(CACHE_KEYS.INDEXES);

        console.log(`All data refreshed in ${Date.now() - start}ms`);
    } catch (error) {
        console.error('Error during refresh:', error.message);
    }
}

// API Routes (read from cache, same as Vercel endpoints)
app.get('/api/stocks/current', async (req, res) => {
    const cached = await getCachedData(CACHE_KEYS.CURRENT);
    if (cached) return res.json(cached);
    res.status(503).json({ error: 'Data loading...' });
});

app.get('/api/stocks/monthly', async (req, res) => {
    const cached = await getCachedData(CACHE_KEYS.MONTHLY);
    if (cached) return res.json(cached);
    res.status(503).json({ error: 'Data loading...' });
});

app.get('/api/indexes', async (req, res) => {
    const cached = await getCachedData(CACHE_KEYS.INDEXES);
    if (cached) return res.json(cached);
    res.status(503).json({ error: 'Data loading...' });
});

app.get('/api/analyses', (req, res) => {
    const managers = loadManagersFromConfig();
    const analyses = {};
    managers.forEach(m => {
        if (m.analysis) analyses[m.name] = { stockSymbol: m.stockSymbol, analysis: m.analysis };
    });
    res.json({ analyses });
});

app.get('/api/cron/refresh-cache', async (req, res) => {
    await refreshAllData();
    res.json({ message: 'Refreshed' });
});

app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Start server and immediately refresh data
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Visit http://localhost:${PORT} to view the app`);
    console.log(`Managers loaded: ${loadManagersFromConfig().length}`);
    refreshAllData();
});
