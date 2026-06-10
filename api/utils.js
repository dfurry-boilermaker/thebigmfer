// Shared utility functions for Vercel API routes
const path = require('path');
const fs = require('fs');
const YahooFinance = require('yahoo-finance2').default;
const yahooFinance = new YahooFinance();

// Initialize Vercel Edge Config (read-only)
// Edge Config connection string is automatically provided by Vercel via EDGE_CONFIG env var
// when you link an Edge Config to your project in the Vercel dashboard
let edgeConfig = null;
const EDGE_CONFIG_ID = 'ecfg_nihngnn5iudhcegkbld1erbfsfj6';
const EDGE_CONFIG_DIGEST = '5bf6b008a9ec05f6870c476d10b53211797aa000f95aae344ae60f9b422286da';

try {
    let connectionString = process.env.EDGE_CONFIG;
    
    // Fallback: construct connection string from provided credentials if EDGE_CONFIG not set
    if (!connectionString) {
        // Edge Config connection string format: https://edge-config.vercel.com/{id}?token={digest}
        connectionString = `https://edge-config.vercel.com/${EDGE_CONFIG_ID}?token=${EDGE_CONFIG_DIGEST}`;
    }
    
    edgeConfig = require('@vercel/edge-config').createClient(connectionString);
} catch (error) {
    // Edge Config initialization failed, fallback to in-memory cache only
    edgeConfig = null;
}

// In-memory cache (primary storage, with Edge Config as read-only backup)
let stockDataCache = {
    current: null,
    monthly: null,
    baselinePrices: null, // Dec 31, 2025 prices (permanent cache)
    lastUpdate: null,
    marketWasOpen: false
};

// Cache key constants
const CACHE_KEYS = {
    CURRENT: 'stock:current',
    MONTHLY: 'stock:monthly',
    LAST_UPDATE: 'stock:lastUpdate',
    MARKET_WAS_OPEN: 'stock:marketWasOpen',
    BASELINE_PRICES: 'stock:baselinePrices' // Dec 31, 2025 prices (never change)
};

// Get cached stock data from Vercel Edge Config
async function getCachedStockData(key) {
    // Always check in-memory cache first (fastest)
    if (key === CACHE_KEYS.CURRENT && stockDataCache.current) {
        // Check if in-memory cache is still valid
        if (stockDataCache.lastUpdate) {
            const cacheAge = Date.now() - stockDataCache.lastUpdate;
            const maxAge = isMarketOpen() ? 15 * 60 * 1000 : 24 * 60 * 60 * 1000;
            if (cacheAge < maxAge) {
                return stockDataCache.current;
            }
        }
    }
    if (key === CACHE_KEYS.MONTHLY && stockDataCache.monthly) {
        if (stockDataCache.lastUpdate) {
            const cacheAge = Date.now() - stockDataCache.lastUpdate;
            const maxAge = isMarketOpen() ? 15 * 60 * 1000 : 24 * 60 * 60 * 1000;
            if (cacheAge < maxAge) {
                return stockDataCache.monthly;
            }
        }
    }
    // Baseline prices are cached permanently (no expiration check)
    if (key === CACHE_KEYS.BASELINE_PRICES && stockDataCache.baselinePrices) {
        return stockDataCache.baselinePrices;
    }
    
    // Try Edge Config (read-only, very fast)
    if (edgeConfig) {
        try {
            const data = await edgeConfig.get(key);
            if (data) {
                // Edge Config stores JSON strings, parse if needed
                const parsed = typeof data === 'string' ? JSON.parse(data) : data;
                // Also update in-memory cache for faster subsequent reads
                if (key === CACHE_KEYS.CURRENT) stockDataCache.current = parsed;
                if (key === CACHE_KEYS.MONTHLY) stockDataCache.monthly = parsed;
                if (key === CACHE_KEYS.BASELINE_PRICES) stockDataCache.baselinePrices = parsed;
                return parsed;
            }
        } catch (error) {
            // Edge Config read failed, continue to fallback
        }
    }
    
    // Fallback to in-memory cache (even if expired)
    if (key === CACHE_KEYS.CURRENT) return stockDataCache.current;
    if (key === CACHE_KEYS.MONTHLY) return stockDataCache.monthly;
    if (key === CACHE_KEYS.BASELINE_PRICES) return stockDataCache.baselinePrices;
    return null;
}

// Set cached stock data (primarily in-memory)
// Note: Edge Config free tier has 100 writes/month limit, so we use in-memory as primary
// Edge Config is used only for reads (very fast), writes stay in-memory
async function setCachedStockData(key, data, ttlSeconds) {
    // Always update in-memory cache (primary storage)
    if (key === CACHE_KEYS.CURRENT) stockDataCache.current = data;
    if (key === CACHE_KEYS.MONTHLY) stockDataCache.monthly = data;
    if (key === CACHE_KEYS.BASELINE_PRICES) stockDataCache.baselinePrices = data;
    
    // Only update lastUpdate for time-sensitive data (not baseline prices)
    if (key !== CACHE_KEYS.BASELINE_PRICES) {
        stockDataCache.lastUpdate = Date.now();
    }
    
    // Note: Edge Config writes require Vercel API token (not digest) and are rate-limited
    // We skip writes to Edge Config and rely on in-memory cache as primary
    // Edge Config will be used for reads only (when available from previous writes via dashboard/API)
}

// Get last update timestamp
async function getLastUpdate() {
    // Check in-memory cache first
    if (stockDataCache.lastUpdate) {
        return stockDataCache.lastUpdate;
    }
    
    // Try Edge Config
    if (edgeConfig) {
        try {
            const timestamp = await edgeConfig.get(CACHE_KEYS.LAST_UPDATE);
            if (timestamp) {
                const parsed = parseInt(timestamp);
                stockDataCache.lastUpdate = parsed;
                return parsed;
            }
        } catch (error) {
            // Edge Config read failed, continue to fallback
        }
    }
    
    return null;
}

// Check if a date is a trading day (weekday and not a holiday)
function isTradingDay(date) {
    // Convert date to Eastern Time
    const etString = date.toLocaleString('en-US', { timeZone: 'America/New_York' });
    const et = new Date(etString);
    
    const day = et.getDay(); // 0 = Sunday, 6 = Saturday
    
    // Exclude weekends
    if (day === 0 || day === 6) {
        return false;
    }
    
    // Check if it's a market holiday in 2026
    const year = et.getFullYear();
    const month = et.getMonth();
    const dayOfMonth = et.getDate();
    
    // 2026 US Market Holidays (NYSE/NASDAQ)
    const holidays2026 = [
        { month: 0, day: 1 },   // New Year's Day (Jan 1)
        { month: 0, day: 19 },  // Martin Luther King Jr. Day (Jan 19 - 3rd Monday)
        { month: 1, day: 16 },  // Presidents' Day (Feb 16 - 3rd Monday)
        { month: 3, day: 3 },   // Good Friday (Apr 3)
        { month: 4, day: 25 },  // Memorial Day (May 25 - last Monday)
        { month: 6, day: 3 },   // Independence Day (Jul 3 - observed, since Jul 4 is Saturday)
        { month: 8, day: 7 },   // Labor Day (Sep 7 - 1st Monday)
        { month: 10, day: 11 }, // Veterans Day (Nov 11)
        { month: 10, day: 26 }, // Thanksgiving (Nov 26 - 4th Thursday)
        { month: 11, day: 25 }  // Christmas (Dec 25)
    ];
    
    // Check if date matches any holiday
    for (const holiday of holidays2026) {
        if (holiday.month === month && holiday.day === dayOfMonth) {
            return false;
        }
    }
    
    return true;
}

function isDuringMarketHours(date) {
    // Convert date to Eastern Time
    const etString = date.toLocaleString('en-US', { timeZone: 'America/New_York' });
    const et = new Date(etString);
    
    const day = et.getDay(); // 0 = Sunday, 6 = Saturday
    
    // Market is closed on weekends
    if (day === 0 || day === 6) {
        return false;
    }
    
    const hour = et.getHours();
    const minute = et.getMinutes();
    const time = hour * 60 + minute; // Time in minutes since midnight
    
    // Market hours: 9:30 AM - 4:00 PM ET
    const marketOpen = 9 * 60 + 30; // 9:30 AM
    const marketClose = 16 * 60; // 4:00 PM
    
    return time >= marketOpen && time < marketClose;
}

// Check if US stock market is currently open
function isMarketOpen() {
    return isDuringMarketHours(new Date());
}

// Check if we should use cached data (async version for KV)
async function shouldUseCache() {
    const lastUpdate = await getLastUpdate();
    
    if (!lastUpdate) {
        return false;
    }
    
    const cacheAge = Date.now() - lastUpdate;
    
    // During market hours: use cache if less than 30 minutes old (matches refresh interval)
    if (isMarketOpen()) {
        const maxCacheAgeMarketHours = 30 * 60 * 1000; // 30 minutes
        if (cacheAge < maxCacheAgeMarketHours) {
            return true;
        }
    } else {
        // Market closed: use cache if less than 24 hours old
        const maxCacheAge = 24 * 60 * 60 * 1000; // 24 hours
        if (cacheAge < maxCacheAge) {
            return true;
        }
    }
    
    return false;
}

// Synchronous version for backward compatibility (checks in-memory cache only)
function shouldUseCacheSync() {
    if (stockDataCache.current && stockDataCache.lastUpdate) {
        const cacheAge = Date.now() - stockDataCache.lastUpdate;
        
        // During market hours: use cache if less than 30 minutes old
        if (isMarketOpen()) {
            const maxCacheAgeMarketHours = 30 * 60 * 1000; // 30 minutes
            if (cacheAge < maxCacheAgeMarketHours) {
                return true;
            }
        } else {
            // Market closed: use cache if less than 24 hours old
            const maxCacheAge = 24 * 60 * 60 * 1000; // 24 hours
            if (cacheAge < maxCacheAge) {
                return true;
            }
        }
    }
    
    return false;
}

// Load managers from JSON file
const TICKER_PATTERN = /^[A-Z0-9.\-]{1,10}$/i;

function loadManagersFromConfig() {
    // In Vercel, __dirname points to the api directory, so go up one level
    const configPath = path.join(process.cwd(), 'managers.json');
    try {
        const configData = fs.readFileSync(configPath, 'utf8');
        const parsed = JSON.parse(configData);

        if (!Array.isArray(parsed)) {
            console.error('managers.json must contain a JSON array of manager entries');
            return [];
        }

        const valid = parsed.filter(entry => {
            const ok = entry
                && typeof entry.name === 'string' && entry.name.trim() !== ''
                && typeof entry.stockSymbol === 'string' && TICKER_PATTERN.test(entry.stockSymbol);
            if (!ok) {
                console.error('Skipping invalid manager entry in managers.json:', JSON.stringify(entry));
            }
            return ok;
        });

        if (valid.length === 0) {
            console.error('managers.json contains no valid manager entries');
        }
        return valid;
    } catch (error) {
        console.error(`Failed to load managers.json (${configPath}):`, error.message);
        return [];
    }
}

// Memo for historical closing prices: closes for past dates never change,
// so they're safe to cache for the lifetime of the process
const historicalPriceCache = new Map(); // `${symbol}|${targetDate}` -> price

// Get historical price for a specific date
async function getHistoricalPrice(symbol, targetDate) {
    const cacheKey = `${symbol}|${targetDate}`;
    const isPastDate = new Date(targetDate).getTime() < new Date().setHours(0, 0, 0, 0);
    if (isPastDate && historicalPriceCache.has(cacheKey)) {
        return historicalPriceCache.get(cacheKey);
    }
    try {
        const targetTimestamp = new Date(targetDate).getTime() / 1000;
        // Fetch a few days around the target date to handle weekends/holidays
        const chartData = await yahooFinance.chart(symbol, {
            period1: Math.floor(targetTimestamp - 5 * 86400), // 5 days before
            period2: Math.floor(targetTimestamp + 2 * 86400), // 2 days after
            interval: '1d'
        });

        if (chartData && chartData.quotes && chartData.quotes.length > 0) {
            // Find the quote closest to but not after the target date
            const targetMs = new Date(targetDate).getTime();
            let bestQuote = null;
            for (const quote of chartData.quotes) {
                const quoteDate = quote.date instanceof Date ? quote.date : new Date(quote.date);
                if (quoteDate.getTime() <= targetMs && quote.close !== null) {
                    bestQuote = quote;
                }
            }
            // Fallback: use the first available close price
            const firstValid = chartData.quotes.find(q => q.close !== null);
            const price = bestQuote ? bestQuote.close : (firstValid ? firstValid.close : null);
            if (isPastDate && price !== null) {
                historicalPriceCache.set(cacheKey, price);
            }
            return price;
        }
        return null;
    } catch (error) {
        console.error(`Error fetching historical price for ${symbol}:`, error.message);
        return null;
    }
}

// Get baseline prices (Dec 31, 2025) with permanent caching
// These prices never change, so we cache them indefinitely
async function getBaselinePrices(symbols) {
    // Check cache first
    const cachedBaselines = await getCachedStockData(CACHE_KEYS.BASELINE_PRICES);
    if (cachedBaselines && Object.keys(cachedBaselines).length === symbols.length) {
        // Verify all symbols are present
        const allPresent = symbols.every(symbol => cachedBaselines.hasOwnProperty(symbol));
        if (allPresent) {
            return symbols.map(symbol => cachedBaselines[symbol]);
        }
    }
    
    // Fetch baseline prices if not cached
    const baselineDate = '2025-12-31';
    const baselinePromises = symbols.map(symbol => 
        getHistoricalPrice(symbol, baselineDate)
    );
    const baselinePrices = await Promise.all(baselinePromises);
    
    // Create a map of symbol to price for caching
    const baselineMap = {};
    symbols.forEach((symbol, index) => {
        if (baselinePrices[index] !== null && baselinePrices[index] !== undefined) {
            baselineMap[symbol] = baselinePrices[index];
        }
    });
    
    // Cache permanently (use a very long TTL - 1 year = 31536000 seconds)
    // Edge Config doesn't support permanent storage, but in-memory cache will persist
    // For Edge Config, we'll use a long TTL and refresh if needed
    await setCachedStockData(CACHE_KEYS.BASELINE_PRICES, baselineMap, 31536000);
    
    return baselinePrices;
}

// Per-symbol dividend cache: dividends change at most quarterly, so 24h is plenty
const dividendCache = new Map(); // symbol -> { totalDividends, fetchedAt }
const DIVIDEND_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

// Get YTD dividends for a symbol (actual dividends with an ex-date since Jan 1, 2026),
// returned as a percentage of the baseline price
async function getYTDDividends(symbol, baselinePrice) {
    if (!baselinePrice || baselinePrice <= 0) {
        return 0;
    }

    const cached = dividendCache.get(symbol);
    if (cached && (Date.now() - cached.fetchedAt) < DIVIDEND_CACHE_TTL_MS) {
        return (cached.totalDividends / baselinePrice) * 100;
    }

    try {
        const result = await yahooFinance.chart(symbol, {
            period1: '2026-01-01',
            period2: Math.floor(Date.now() / 1000),
            interval: '1d',
            events: 'div'
        });

        // chart() may return dividends as an array or keyed by timestamp
        const rawDividends = result?.events?.dividends;
        const dividends = Array.isArray(rawDividends) ? rawDividends : Object.values(rawDividends || {});
        const yearStart = new Date(2026, 0, 1);

        const totalDividends = dividends
            .filter(div => div && typeof div.amount === 'number' && new Date(div.date) >= yearStart)
            .reduce((sum, div) => sum + div.amount, 0);

        dividendCache.set(symbol, { totalDividends, fetchedAt: Date.now() });

        return (totalDividends / baselinePrice) * 100;
    } catch (error) {
        // Non-critical: leaderboard falls back to price-only return for this symbol
        console.warn(`Could not fetch dividend history for ${symbol}:`, error.message);
        return 0;
    }
}

// Compute the full leaderboard entry for one manager from a live quote.
// Shared by api/stocks/current.js, server.js, and the cache-refresh cron so the
// three paths can never drift apart.
async function computeManagerResult(manager, quote, baselinePrice) {
    const symbol = manager.stockSymbol;

    if (!quote || !baselinePrice) {
        return {
            name: manager.name,
            symbol: symbol,
            currentPrice: 0,
            changePercent: null,
            change1d: null,
            change1w: null,
            change1m: null,
            change3m: null,
            analysis: manager.analysis || null
        };
    }

    const currentPrice = quote.regularMarketPrice || quote.price || quote.regularMarketPreviousClose || 0;
    const previousClose = quote.regularMarketPreviousClose || baselinePrice || currentPrice;

    // YTD total return = price appreciation + dividends paid since Jan 1, 2026
    const ytdPriceChange = baselinePrice > 0
        ? ((currentPrice - baselinePrice) / baselinePrice) * 100
        : 0;
    const ytdDividendYield = await getYTDDividends(symbol, baselinePrice);
    const ytdChange = ytdPriceChange + ytdDividendYield;

    let change1d = null;
    if (previousClose && previousClose > 0) {
        change1d = ((currentPrice - previousClose) / previousClose) * 100;
    } else if (baselinePrice && baselinePrice > 0) {
        // Use baseline if previousClose not available (first trading day)
        change1d = ((currentPrice - baselinePrice) / baselinePrice) * 100;
    }

    const yearStart = new Date(2026, 0, 1);
    const today = new Date();
    const daysSinceStart = Math.floor((today - yearStart) / (1000 * 60 * 60 * 24));

    let change1w = null;
    let change1m = null;
    let change3m = null;

    if (daysSinceStart >= 7) {
        const oneWeekAgo = new Date(today);
        oneWeekAgo.setDate(today.getDate() - 7);
        const oneWeekPrice = await getHistoricalPrice(symbol, oneWeekAgo.toISOString().split('T')[0]);
        if (oneWeekPrice && oneWeekPrice > 0) {
            change1w = ((currentPrice - oneWeekPrice) / oneWeekPrice) * 100;
        }
    }

    if (daysSinceStart >= 30) {
        const oneMonthAgo = new Date(today);
        oneMonthAgo.setDate(today.getDate() - 30);
        const oneMonthPrice = await getHistoricalPrice(symbol, oneMonthAgo.toISOString().split('T')[0]);
        if (oneMonthPrice && oneMonthPrice > 0) {
            change1m = ((currentPrice - oneMonthPrice) / oneMonthPrice) * 100;
        }
    }

    if (daysSinceStart >= 90) {
        const threeMonthsAgo = new Date(today);
        threeMonthsAgo.setDate(today.getDate() - 90);
        const threeMonthPrice = await getHistoricalPrice(symbol, threeMonthsAgo.toISOString().split('T')[0]);
        if (threeMonthPrice && threeMonthPrice > 0) {
            change3m = ((currentPrice - threeMonthPrice) / threeMonthPrice) * 100;
        }
    }

    return {
        name: manager.name,
        symbol: symbol,
        currentPrice: currentPrice,
        changePercent: ytdChange,
        change1d: change1d,
        change1w: change1w,
        change1m: change1m,
        change3m: change3m,
        analysis: manager.analysis || null
    };
}

// Detect Yahoo Finance rate-limit errors. yahoo-finance2's HTTPError sets
// error.code to the HTTP status; string match kept as a fallback.
function isRateLimitError(error) {
    if (!error) return false;
    if (error.code === 429 || error.status === 429) return true;
    return typeof error.message === 'string' && /too many requests|rate limit/i.test(error.message);
}

// Get intraday/hourly data for a symbol
async function getIntradayData(symbol, startDate, endDate, interval = '1h') {
    try {
        // Use chart() method for intraday data (supports hourly intervals)
        // This is the recommended method for intraday data in yahoo-finance2
        const chartData = await yahooFinance.chart(symbol, {
            period1: Math.floor(startDate.getTime() / 1000),
            period2: Math.floor(endDate.getTime() / 1000),
            interval: interval
        });
        
        if (chartData && chartData.quotes && chartData.quotes.length > 0) {
            // Convert chart format to historical format for consistency
            // Chart returns dates as Date objects
            // Filter to only include market hours data (9:30 AM - 4:00 PM ET, weekdays)
            const filteredQuotes = chartData.quotes.map(quote => {
                // quote.date is already a Date object
                const date = quote.date instanceof Date ? quote.date : new Date(quote.date);
                return {
                    date: date,
                    close: quote.close,
                    open: quote.open,
                    high: quote.high,
                    low: quote.low,
                    volume: quote.volume
                };
            }).filter(quote => {
                // Filter out invalid dates or null closes
                if (!quote.date || quote.close === null || quote.close === undefined) {
                    return false;
                }
                // Only include data during market hours (9:30 AM - 4:00 PM ET) and on trading days
                return isDuringMarketHours(quote.date) && isTradingDay(quote.date);
            });
            
            // Expand hourly data to include both open and close prices for each hour
            // This provides more granular intraday movement
            const expandedData = [];
            for (let i = 0; i < filteredQuotes.length; i++) {
                const quote = filteredQuotes[i];
                
                // Add open price at the start of the hour (if available)
                if (quote.open !== null && quote.open !== undefined) {
                    const openDate = new Date(quote.date);
                    // Set to start of hour (e.g., 9:30, 10:30, etc.)
                    openDate.setMinutes(0);
                    openDate.setSeconds(0);
                    openDate.setMilliseconds(0);
                    
                    expandedData.push({
                        date: openDate,
                        close: quote.open, // Use open as the "close" price for this timestamp
                        open: quote.open,
                        high: quote.high,
                        low: quote.low,
                        volume: quote.volume
                    });
                }
                
                // Add close price at the end of the hour
                if (quote.close !== null && quote.close !== undefined) {
                    expandedData.push({
                        date: quote.date,
                        close: quote.close,
                        open: quote.open,
                        high: quote.high,
                        low: quote.low,
                        volume: quote.volume
                    });
                }
            }
            
            return expandedData.length > 0 ? expandedData : filteredQuotes;
        }
        return null;
    } catch (error) {
        // Intraday data might not be available, fallback to daily
        // This is expected for some stocks or outside market hours
        return null;
    }
}
module.exports = {
    loadManagersFromConfig,
    getHistoricalPrice,
    getBaselinePrices,
    getYTDDividends,
    computeManagerResult,
    isRateLimitError,
    getIntradayData,
    isMarketOpen,
    isDuringMarketHours,
    isTradingDay,
    shouldUseCache,
    shouldUseCacheSync,
    getCachedStockData,
    setCachedStockData,
    getLastUpdate,
    CACHE_KEYS,
    stockDataCache
};

