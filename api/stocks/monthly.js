const YahooFinance = require('yahoo-finance2').default;
const yahooFinance = new YahooFinance();
const {
    loadManagersFromConfig,
    getBaselinePrices,
    shouldUseCache,
    getCachedStockData,
    setCachedStockData,
    CACHE_KEYS,
    isMarketOpen
} = require('../utils');

// Delay helper to avoid rate limiting
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

// Pick a consistent interval based on how far into the year we are.
// Month 0-1 (Jan-Feb): daily; Month 2-5 (Mar-Jun): weekly; Month 6+ (Jul-Dec): monthly.
function ytdInterval(currentMonth) {
    if (currentMonth <= 1) return '1d';
    if (currentMonth <= 5) return '1wk';
    return '1mo';
}

// Fetch and process data for a single stock
async function fetchStockChartData(manager, baselinePrice, firstTradingDay, todayEnd, interval) {
    const symbol = manager.stockSymbol;

    if (!baselinePrice) {
        return { name: manager.name, symbol, data: [], timestamps: [] };
    }

    try {
        const history = await yahooFinance.historical(symbol, {
            period1: Math.floor(firstTradingDay.getTime() / 1000),
            period2: Math.floor(todayEnd.getTime() / 1000),
            interval
        });

        if (!history || history.length === 0) {
            return { name: manager.name, symbol, data: [], timestamps: [] };
        }

        history.sort((a, b) => a.date.getTime() - b.date.getTime());

        const data = [];
        const timestamps = [];

        for (const entry of history) {
            if (entry.close === null || entry.close === undefined) continue;
            const entryDate = entry.date instanceof Date ? entry.date : new Date(entry.date);
            const percentChange = ((entry.close - baselinePrice) / baselinePrice) * 100;
            data.push(percentChange);
            timestamps.push(entryDate.getTime());
        }

        return { name: manager.name, symbol, data, timestamps };
    } catch (error) {
        console.error(`Error fetching historical data for ${symbol}:`, error.message);
        return { name: manager.name, symbol, data: [], timestamps: [] };
    }
}

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

    try {
        const useCache = await shouldUseCache();
        if (useCache) {
            const cachedData = await getCachedStockData(CACHE_KEYS.MONTHLY);
            if (cachedData) return res.status(200).json(cachedData);
        }

        const managers = loadManagersFromConfig();
        const symbols = managers.map(m => m.stockSymbol);
        const baselinePrices = await getBaselinePrices(symbols);

        const today = new Date();
        const todayEnd = new Date(today);
        todayEnd.setHours(23, 59, 59, 999);
        const firstTradingDay = new Date(2026, 0, 2); // Jan 2, 2026

        // Build month labels for x-axis
        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        const currentMonth = today.getMonth();
        const currentDay = today.getDate();
        const monthLabels = [];
        for (let i = 0; i < currentMonth; i++) monthLabels.push(months[i]);
        monthLabels.push(`${months[currentMonth]} ${currentDay}`);

        const interval = ytdInterval(currentMonth);

        // Fetch stocks in batches of 4 with delay between batches to avoid rate limiting
        const BATCH_SIZE = 4;
        const BATCH_DELAY_MS = 500;
        const stockData = [];

        for (let i = 0; i < managers.length; i += BATCH_SIZE) {
            if (i > 0) await delay(BATCH_DELAY_MS);
            const batch = managers.slice(i, i + BATCH_SIZE);
            const batchPrices = baselinePrices.slice(i, i + BATCH_SIZE);
            const batchResults = await Promise.all(
                batch.map((manager, j) =>
                    fetchStockChartData(manager, batchPrices[j], firstTradingDay, todayEnd, interval)
                )
            );
            stockData.push(...batchResults);
        }

        const validStockData = stockData.filter(s => s.data && s.data.length > 0);

        if (validStockData.length === 0) {
            const cachedData = await getCachedStockData(CACHE_KEYS.MONTHLY);
            if (cachedData?.data?.length > 0) return res.status(200).json(cachedData);
            return res.status(503).json({ error: 'Unable to fetch chart data. Please try again later.' });
        }

        const responseData = { months: monthLabels, data: validStockData };

        const ttlSeconds = isMarketOpen() ? 1800 : 86400;
        await setCachedStockData(CACHE_KEYS.MONTHLY, responseData, ttlSeconds);

        res.status(200).json(responseData);
    } catch (error) {
        console.error('Error fetching monthly stocks:', error);

        const cachedData = await getCachedStockData(CACHE_KEYS.MONTHLY);
        if (cachedData?.data?.length > 0) return res.status(200).json(cachedData);

        res.status(503).json({ error: 'Failed to fetch monthly stock data. Please try again later.' });
    }
};
