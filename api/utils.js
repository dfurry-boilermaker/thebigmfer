const path = require('path');
const fs = require('fs');
const YahooFinance = require('yahoo-finance2').default;
const yahooFinance = new YahooFinance();

// In-memory cache (persists within a single serverless instance).
// On cold start the cron job repopulates within 15 minutes.
const kv = null;

// In-memory fallback for local dev (or when KV is unavailable)
const memoryCache = {};

const CACHE_KEYS = {
    CURRENT: 'stock:current',
    MONTHLY: 'stock:monthly',
    INDEXES: 'stock:indexes',
    BASELINE_PRICES: 'stock:baselinePrices',
    REFRESH_LOCK: 'stock:refreshLock'
};

// --- Cache read/write (KV with in-memory fallback) ---

async function getCachedData(key) {
    if (kv) {
        try {
            return await kv.get(key);
        } catch (e) {
            // KV unavailable, fall through to memory
        }
    }
    const entry = memoryCache[key];
    if (!entry) return null;
    if (entry.expiresAt && Date.now() > entry.expiresAt) {
        delete memoryCache[key];
        return null;
    }
    return entry.data;
}

async function setCachedData(key, data, ttlSeconds) {
    if (kv) {
        try {
            await kv.set(key, data, { ex: ttlSeconds });
            return;
        } catch (e) {
            // KV unavailable, fall through to memory
        }
    }
    memoryCache[key] = {
        data,
        expiresAt: ttlSeconds ? Date.now() + ttlSeconds * 1000 : null
    };
}

// Check if cached data is stale (past its refresh window, but KV TTL hasn't expired yet)
async function isStale(key) {
    const tsKey = `${key}:ts`;
    let lastUpdate = null;
    if (kv) {
        try { lastUpdate = await kv.get(tsKey); } catch (e) {}
    }
    if (!lastUpdate && memoryCache[tsKey]) {
        lastUpdate = memoryCache[tsKey].data;
    }
    if (!lastUpdate) return true;
    const age = Date.now() - lastUpdate;
    const maxFresh = isMarketOpen() ? 15 * 60 * 1000 : 24 * 60 * 60 * 1000;
    return age > maxFresh;
}

async function markRefreshed(key) {
    const tsKey = `${key}:ts`;
    const now = Date.now();
    if (kv) {
        try { await kv.set(tsKey, now, { ex: 86400 }); } catch (e) {}
    }
    memoryCache[tsKey] = { data: now, expiresAt: null };
}

// Acquire a refresh lock (prevents concurrent cron re-triggers)
async function acquireRefreshLock(ttlSeconds = 25) {
    if (kv) {
        try {
            const result = await kv.set(CACHE_KEYS.REFRESH_LOCK, 1, { ex: ttlSeconds, nx: true });
            return result === 'OK';
        } catch (e) {
            return true; // If KV fails, allow refresh
        }
    }
    if (memoryCache[CACHE_KEYS.REFRESH_LOCK]) {
        const entry = memoryCache[CACHE_KEYS.REFRESH_LOCK];
        if (entry.expiresAt && Date.now() < entry.expiresAt) return false;
    }
    memoryCache[CACHE_KEYS.REFRESH_LOCK] = {
        data: 1,
        expiresAt: Date.now() + ttlSeconds * 1000
    };
    return true;
}

// --- Timeout wrapper for Yahoo Finance calls ---

async function fetchWithTimeout(fetchFn, timeoutMs = 5000) {
    return Promise.race([
        fetchFn(),
        new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Yahoo Finance timeout')), timeoutMs)
        )
    ]);
}

// Fetch quotes for multiple symbols with parallel fallback
async function fetchQuotesBatched(symbols, timeoutMs = 5000) {
    // Try batch first
    try {
        const result = await fetchWithTimeout(() => yahooFinance.quote(symbols), timeoutMs);
        return Array.isArray(result) ? result : [result];
    } catch (e) {
        // Fallback: individual parallel fetches
        const results = await Promise.allSettled(
            symbols.map(symbol =>
                fetchWithTimeout(() => yahooFinance.quote(symbol), timeoutMs)
            )
        );
        return results
            .filter(r => r.status === 'fulfilled' && r.value)
            .map(r => Array.isArray(r.value) ? r.value[0] : r.value);
    }
}

// --- Market hours / trading day helpers ---

function isMarketOpen() {
    return isDuringMarketHours(new Date());
}

function isDuringMarketHours(date) {
    const etString = date.toLocaleString('en-US', { timeZone: 'America/New_York' });
    const et = new Date(etString);
    const day = et.getDay();
    if (day === 0 || day === 6) return false;
    const time = et.getHours() * 60 + et.getMinutes();
    return time >= 570 && time < 960; // 9:30 AM - 4:00 PM
}

function isTradingDay(date) {
    const etString = date.toLocaleString('en-US', { timeZone: 'America/New_York' });
    const et = new Date(etString);
    const day = et.getDay();
    if (day === 0 || day === 6) return false;
    const month = et.getMonth();
    const dayOfMonth = et.getDate();
    const holidays2026 = [
        { month: 0, day: 1 }, { month: 0, day: 19 },
        { month: 1, day: 16 }, { month: 3, day: 3 },
        { month: 4, day: 25 }, { month: 5, day: 19 },
        { month: 6, day: 3 }, { month: 8, day: 7 },
        { month: 10, day: 26 }, { month: 11, day: 25 }
    ];
    return !holidays2026.some(h => h.month === month && h.day === dayOfMonth);
}

// --- Data fetching helpers ---

function loadManagersFromConfig() {
    try {
        const configPath = path.join(process.cwd(), 'managers.json');
        const configData = fs.readFileSync(configPath, 'utf8');
        return JSON.parse(configData);
    } catch (error) {
        console.error('Error loading managers.json:', error.message);
        return [];
    }
}

async function getHistoricalPrice(symbol, targetDate, timeoutMs = 5000) {
    try {
        const targetTimestamp = new Date(targetDate).getTime() / 1000;
        const chartData = await fetchWithTimeout(() =>
            yahooFinance.chart(symbol, {
                period1: Math.floor(targetTimestamp - 5 * 86400),
                period2: Math.floor(targetTimestamp + 2 * 86400),
                interval: '1d'
            }), timeoutMs
        );

        if (chartData && chartData.quotes && chartData.quotes.length > 0) {
            const targetMs = new Date(targetDate).getTime();
            let bestQuote = null;
            for (const quote of chartData.quotes) {
                const quoteDate = quote.date instanceof Date ? quote.date : new Date(quote.date);
                if (quoteDate.getTime() <= targetMs && quote.close !== null) {
                    bestQuote = quote;
                }
            }
            if (bestQuote) return bestQuote.close;
            const firstValid = chartData.quotes.find(q => q.close !== null);
            return firstValid ? firstValid.close : null;
        }
        return null;
    } catch (error) {
        return null;
    }
}

// Get baseline prices with permanent caching in KV
async function getBaselinePrices(symbols) {
    const cached = await getCachedData(CACHE_KEYS.BASELINE_PRICES);
    if (cached && typeof cached === 'object') {
        const allPresent = symbols.every(s => cached.hasOwnProperty(s) && cached[s] !== null);
        if (allPresent) return symbols.map(s => cached[s]);
    }

    // Fetch in parallel with timeouts
    const results = await Promise.allSettled(
        symbols.map(s => getHistoricalPrice(s, '2025-12-31', 8000))
    );
    const prices = results.map(r => r.status === 'fulfilled' ? r.value : null);

    const baselineMap = {};
    symbols.forEach((s, i) => {
        if (prices[i] !== null) baselineMap[s] = prices[i];
    });

    if (Object.keys(baselineMap).length > 0) {
        await setCachedData(CACHE_KEYS.BASELINE_PRICES, baselineMap, 365 * 24 * 3600);
    }
    return prices;
}

// Get YTD dividends (percentage of baseline price)
async function getYTDDividends(symbol, baselinePrice, timeoutMs = 5000) {
    if (!baselinePrice || baselinePrice <= 0) return 0;
    try {
        const quoteSummary = await fetchWithTimeout(() =>
            yahooFinance.quoteSummary(symbol, { modules: ['summaryDetail'] }),
            timeoutMs
        );
        if (!quoteSummary || !quoteSummary.summaryDetail) return 0;

        const annualRate = quoteSummary.summaryDetail.dividendRate ||
            quoteSummary.summaryDetail.trailingAnnualDividendRate || 0;
        if (annualRate === 0) return 0;

        const today = new Date();
        const yearStart = new Date(2026, 0, 1);
        const daysSinceStart = Math.floor((today - yearStart) / (1000 * 60 * 60 * 24));
        const perQuarter = annualRate / 4;

        let paid = 0;
        if (daysSinceStart >= 90) paid += perQuarter;
        if (daysSinceStart >= 181) paid += perQuarter;
        if (daysSinceStart >= 273) paid += perQuarter;

        return (paid / baselinePrice) * 100;
    } catch (e) {
        return 0;
    }
}

// Pick chart interval based on how far into the year we are
function ytdInterval(currentMonth) {
    if (currentMonth <= 1) return '1d';
    if (currentMonth <= 5) return '1wk';
    return '1mo';
}

// Trigger background refresh (fire-and-forget, safe for Node <18)
function triggerBackgroundRefresh() {
    const baseUrl = process.env.VERCEL_URL
        ? `https://${process.env.VERCEL_URL}`
        : `http://localhost:${process.env.PORT || 3000}`;
    try {
        const url = `${baseUrl}/api/cron/refresh-cache`;
        if (typeof fetch === 'function') {
            fetch(url, {
                headers: { 'Authorization': `Bearer ${process.env.CRON_SECRET || ''}` }
            }).catch(() => {});
        } else {
            const https = require('https');
            const http = require('http');
            const mod = url.startsWith('https') ? https : http;
            const req = mod.get(url, { headers: { 'Authorization': `Bearer ${process.env.CRON_SECRET || ''}` } });
            req.on('error', () => {});
            req.end();
        }
    } catch (e) {}
}

module.exports = {
    CACHE_KEYS,
    getCachedData,
    setCachedData,
    isStale,
    markRefreshed,
    acquireRefreshLock,
    fetchWithTimeout,
    fetchQuotesBatched,
    isMarketOpen,
    isDuringMarketHours,
    isTradingDay,
    loadManagersFromConfig,
    getHistoricalPrice,
    getBaselinePrices,
    getYTDDividends,
    ytdInterval,
    triggerBackgroundRefresh,
    yahooFinance
};
