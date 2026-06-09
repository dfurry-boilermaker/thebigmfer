const {
    CACHE_KEYS,
    getCachedData,
    setCachedData,
    markRefreshed,
    acquireRefreshLock,
    fetchWithTimeout,
    fetchQuotesBatched,
    isMarketOpen,
    loadManagersFromConfig,
    getBaselinePrices,
    getHistoricalPrice,
    getYTDDividends,
    ytdInterval,
    yahooFinance
} = require('../utils');

async function refreshCurrentData() {
    const managers = loadManagersFromConfig();
    const symbols = managers.map(m => m.stockSymbol);

    // Parallel: quotes + baselines
    const [quotes, baselinePrices] = await Promise.all([
        fetchQuotesBatched(symbols, 5000),
        getBaselinePrices(symbols)
    ]);

    const quoteMap = {};
    quotes.forEach(q => { if (q) quoteMap[q.symbol] = q; });

    const today = new Date();
    const yearStart = new Date(2026, 0, 1);
    const daysSinceStart = Math.floor((today - yearStart) / (1000 * 60 * 60 * 24));

    // Parallel: dividends for all symbols
    const dividendResults = await Promise.allSettled(
        managers.map((m, i) => getYTDDividends(m.stockSymbol, baselinePrices[i], 5000))
    );
    const dividends = dividendResults.map(r => r.status === 'fulfilled' ? r.value : 0);

    // Parallel: 1m historical prices (if applicable)
    let oneMonthPrices = new Array(symbols.length).fill(null);
    if (daysSinceStart >= 30) {
        const oneMonthAgo = new Date(today);
        oneMonthAgo.setDate(today.getDate() - 30);
        const dateStr = oneMonthAgo.toISOString().split('T')[0];
        const results = await Promise.allSettled(
            symbols.map(s => getHistoricalPrice(s, dateStr, 5000))
        );
        oneMonthPrices = results.map(r => r.status === 'fulfilled' ? r.value : null);
    }

    // Parallel: 3m historical prices (if applicable)
    let threeMonthPrices = new Array(symbols.length).fill(null);
    if (daysSinceStart >= 90) {
        const threeMonthsAgo = new Date(today);
        threeMonthsAgo.setDate(today.getDate() - 90);
        const dateStr = threeMonthsAgo.toISOString().split('T')[0];
        const results = await Promise.allSettled(
            symbols.map(s => getHistoricalPrice(s, dateStr, 5000))
        );
        threeMonthPrices = results.map(r => r.status === 'fulfilled' ? r.value : null);
    }

    // Assemble results
    const results = managers.map((manager, i) => {
        const symbol = manager.stockSymbol;
        const quote = quoteMap[symbol];
        const baseline = baselinePrices[i];

        if (!quote || !baseline) {
            return {
                name: manager.name,
                symbol,
                currentPrice: 0,
                changePercent: null,
                change1d: null,
                change1m: null,
                change3m: null,
                analysis: manager.analysis || null
            };
        }

        const currentPrice = quote.regularMarketPrice || quote.price || quote.regularMarketPreviousClose || 0;
        const previousClose = quote.regularMarketPreviousClose || baseline;

        const ytdPriceChange = baseline > 0 ? ((currentPrice - baseline) / baseline) * 100 : 0;
        const ytdChange = ytdPriceChange + dividends[i];

        let change1d = null;
        if (previousClose > 0) {
            change1d = ((currentPrice - previousClose) / previousClose) * 100;
        }

        let change1m = null;
        if (oneMonthPrices[i] && oneMonthPrices[i] > 0) {
            change1m = ((currentPrice - oneMonthPrices[i]) / oneMonthPrices[i]) * 100;
        }

        let change3m = null;
        if (threeMonthPrices[i] && threeMonthPrices[i] > 0) {
            change3m = ((currentPrice - threeMonthPrices[i]) / threeMonthPrices[i]) * 100;
        }

        return {
            name: manager.name,
            symbol,
            currentPrice,
            changePercent: ytdChange,
            change1d,
            change1m,
            change3m,
            analysis: manager.analysis || null
        };
    });

    results.sort((a, b) => (b.changePercent || -Infinity) - (a.changePercent || -Infinity));

    const ttl = isMarketOpen() ? 1800 : 86400;
    await setCachedData(CACHE_KEYS.CURRENT, results, ttl);
    await markRefreshed(CACHE_KEYS.CURRENT);
    console.log(`Refreshed current data: ${results.filter(r => r.changePercent !== null).length} stocks`);
}

async function refreshMonthlyData() {
    const managers = loadManagersFromConfig();
    const symbols = managers.map(m => m.stockSymbol);
    const baselinePrices = await getBaselinePrices(symbols);

    const today = new Date();
    const todayEnd = new Date(today);
    todayEnd.setHours(23, 59, 59, 999);
    const firstTradingDay = new Date(2026, 0, 2);
    const currentMonth = today.getMonth();

    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const monthLabels = [];
    for (let i = 0; i < currentMonth; i++) monthLabels.push(months[i]);
    monthLabels.push(`${months[currentMonth]} ${today.getDate()}`);

    const interval = ytdInterval(currentMonth);

    // Fetch all historical data in parallel with timeouts
    const historyResults = await Promise.allSettled(
        symbols.map(symbol =>
            fetchWithTimeout(() =>
                yahooFinance.historical(symbol, {
                    period1: Math.floor(firstTradingDay.getTime() / 1000),
                    period2: Math.floor(todayEnd.getTime() / 1000),
                    interval
                }), 10000 // 10s timeout for historical (larger response)
            )
        )
    );

    const stockData = managers.map((manager, i) => {
        const symbol = manager.stockSymbol;
        const baseline = baselinePrices[i];

        if (!baseline || historyResults[i].status !== 'fulfilled' || !historyResults[i].value) {
            return { name: manager.name, symbol, data: [], timestamps: [] };
        }

        const history = historyResults[i].value;
        if (!Array.isArray(history) || history.length === 0) {
            return { name: manager.name, symbol, data: [], timestamps: [] };
        }

        history.sort((a, b) => new Date(a.date) - new Date(b.date));

        const data = [];
        const timestamps = [];
        for (const entry of history) {
            if (entry.close === null || entry.close === undefined) continue;
            const entryDate = entry.date instanceof Date ? entry.date : new Date(entry.date);
            data.push(((entry.close - baseline) / baseline) * 100);
            timestamps.push(entryDate.getTime());
        }

        return { name: manager.name, symbol, data, timestamps };
    });

    const validData = stockData.filter(s => s.data.length > 0);
    if (validData.length === 0) {
        console.log('Monthly refresh: no valid data fetched');
        return;
    }

    const responseData = { months: monthLabels, data: validData };
    const ttl = isMarketOpen() ? 1800 : 86400;
    await setCachedData(CACHE_KEYS.MONTHLY, responseData, ttl);
    await markRefreshed(CACHE_KEYS.MONTHLY);
    console.log(`Refreshed monthly data: ${validData.length} stocks`);
}

async function refreshIndexData() {
    const indexes = [
        { symbol: 'SPY', name: 'S&P 500' },
        { symbol: 'QQQ', name: 'Nasdaq 100' },
        { symbol: 'DIA', name: 'Dow Jones' },
        { symbol: 'DX-Y.NYB', name: 'US Dollar' }
    ];

    const indexSymbols = indexes.map(idx => idx.symbol);
    const [quotes, baselinePrices] = await Promise.all([
        fetchQuotesBatched(indexSymbols, 5000),
        getBaselinePrices(indexSymbols)
    ]);

    const quoteMap = {};
    quotes.forEach(q => { if (q) quoteMap[q.symbol] = q; });

    const results = indexes.map((index, i) => {
        const quote = quoteMap[index.symbol];
        const baseline = baselinePrices[i];

        if (!quote || !baseline) {
            return { symbol: index.symbol, name: index.name, currentPrice: null, changePercent: null, change1d: null };
        }

        const currentPrice = quote.regularMarketPrice || quote.price || quote.regularMarketPreviousClose || 0;
        const previousClose = quote.regularMarketPreviousClose || baseline;

        const ytdChange = baseline > 0 ? ((currentPrice - baseline) / baseline) * 100 : 0;
        let change1d = null;
        if (previousClose > 0) {
            change1d = ((currentPrice - previousClose) / previousClose) * 100;
        }

        return { symbol: index.symbol, name: index.name, currentPrice, changePercent: ytdChange, change1d };
    });

    const ttl = isMarketOpen() ? 900 : 86400;
    await setCachedData(CACHE_KEYS.INDEXES, results, ttl);
    await markRefreshed(CACHE_KEYS.INDEXES);
    console.log(`Refreshed index data: ${results.filter(r => r.changePercent !== null).length} indexes`);
}

module.exports = async (req, res) => {
    if (process.env.CRON_SECRET && req.headers['authorization'] !== `Bearer ${process.env.CRON_SECRET}`) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    // Prevent concurrent refreshes
    const gotLock = await acquireRefreshLock(28);
    if (!gotLock) {
        return res.status(200).json({ message: 'Refresh already in progress' });
    }

    const startTime = Date.now();

    try {
        // Run all three refreshes in parallel
        const results = await Promise.allSettled([
            refreshCurrentData(),
            refreshMonthlyData(),
            refreshIndexData()
        ]);

        const summary = {
            current: results[0].status,
            monthly: results[1].status,
            indexes: results[2].status,
            durationMs: Date.now() - startTime
        };

        if (results.some(r => r.status === 'rejected')) {
            results.forEach((r, i) => {
                if (r.status === 'rejected') {
                    console.error(`Refresh ${['current', 'monthly', 'indexes'][i]} failed:`, r.reason?.message);
                }
            });
        }

        console.log(`Cache refresh completed in ${summary.durationMs}ms`);
        res.status(200).json({ message: 'Cache refresh completed', ...summary });
    } catch (error) {
        console.error('Cache refresh error:', error.message);
        res.status(500).json({ error: 'Cache refresh failed', details: error.message });
    }
};
