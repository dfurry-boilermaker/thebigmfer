// Shared utility functions for Vercel API routes
const path = require('path');
const fs = require('fs');
const yahooFinance = require('yahoo-finance2').default;

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
    console.log('Vercel Edge Config initialized successfully (read-only)');
} catch (error) {
    console.log('Vercel Edge Config initialization failed, using in-memory cache only:', error.message);
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
            console.error(`Error getting cache from Edge Config for ${key}:`, error.message);
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
            console.error('Error getting last update from Edge Config:', error.message);
        }
    }
    
    return null;
}

// Check if a specific date/time is during market hours (9:30 AM - 4:00 PM ET, weekdays only)
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
    
    // During market hours: use cache if less than 15 minutes old (matches refresh interval)
    if (isMarketOpen()) {
        const maxCacheAgeMarketHours = 15 * 60 * 1000; // 15 minutes
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
        
        // During market hours: use cache if less than 15 minutes old
        if (isMarketOpen()) {
            const maxCacheAgeMarketHours = 15 * 60 * 1000; // 15 minutes
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
function loadManagersFromConfig() {
    try {
        // In Vercel, __dirname points to the api directory, so go up one level
        const configPath = path.join(process.cwd(), 'managers.json');
        const configData = fs.readFileSync(configPath, 'utf8');
        return JSON.parse(configData);
    } catch (error) {
        console.error('Error loading managers.json:', error);
        return [];
    }
}

// Get historical price for a specific date
async function getHistoricalPrice(symbol, targetDate) {
    try {
        const historical = await yahooFinance.historical(symbol, {
            period1: new Date(targetDate).getTime() / 1000,
            period2: new Date(targetDate).getTime() / 1000 + 86400, // Add 1 day
        });
        
        if (historical && historical.length > 0) {
            // Return the last entry (should be the target date)
            return historical[historical.length - 1].close;
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
            console.log('Using cached baseline prices');
            return symbols.map(symbol => cachedBaselines[symbol]);
        }
    }
    
    // Fetch baseline prices if not cached
    console.log('Fetching baseline prices (will cache permanently)');
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
                // Only include data during market hours (9:30 AM - 4:00 PM ET, weekdays)
                return isDuringMarketHours(quote.date);
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
        console.log(`Intraday data not available for ${symbol}, will use daily data:`, error.message);
        return null;
    }
}

// Generate mock chart data with hourly granularity
function generateMockChartData() {
    const managers = loadManagersFromConfig();
    
    // Mock data goes up to today (or a recent date)
    const today = new Date();
    const mockEndDate = new Date(today);
    // For demo purposes, set to a future date (e.g., 2 weeks from now)
    mockEndDate.setDate(mockEndDate.getDate() + 14);
    
    const firstTradingDay = new Date(2026, 0, 2); // Jan 2, 2026
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    
    // Generate month labels
    const monthLabels = [];
    const currentMonth = mockEndDate.getMonth();
    const currentDay = mockEndDate.getDate();
    for (let i = 0; i < currentMonth; i++) {
        monthLabels.push(months[i]);
    }
    if (currentMonth >= 0) {
        monthLabels.push(`${months[currentMonth]} ${currentDay}`);
    }
    
    // Define unique performance patterns for each stock with realistic characteristics
    const stockPatterns = [
        // Daniel - NBIS: Strong start, then moderate growth with some volatility
        { base: 0, trend: 0.15, volatility: 0.08, momentum: 0.02 },
        // Sam - NVDA: High volatility tech stock with big swings
        { base: 0, trend: 0.20, volatility: 0.15, momentum: 0.03 },
        // Szklarek - WY: Steady consistent growth, low volatility
        { base: 0, trend: 0.10, volatility: 0.04, momentum: 0.01 },
        // Cale - NVO: Strong upward trend with moderate volatility
        { base: 0, trend: 0.18, volatility: 0.06, momentum: 0.025 },
        // Charlie - TSLA: High volatility, big moves, some negative periods
        { base: 0, trend: 0.08, volatility: 0.12, momentum: -0.01 },
        // Kruse - AMTM: Slow and steady, very low volatility
        { base: 0, trend: 0.08, volatility: 0.03, momentum: 0.008 },
        // Kyle - PLTR: Tech growth with corrections, high volatility
        { base: 0, trend: 0.22, volatility: 0.10, momentum: 0.02 },
        // Adam - JPM: Financial sector, moderate growth, moderate volatility
        { base: 0, trend: 0.12, volatility: 0.05, momentum: 0.015 },
        // Carson - AMZN: E-commerce giant, steady climb, low volatility
        { base: 0, trend: 0.14, volatility: 0.05, momentum: 0.018 },
        // Grant - WM: Waste management, stable, very low volatility
        { base: 0, trend: 0.09, volatility: 0.03, momentum: 0.01 },
        // Nick - PM: Tobacco, defensive play, low volatility
        { base: 0, trend: 0.07, volatility: 0.03, momentum: 0.008 },
        // Pierino - CRCL: Circular economy, growth potential, moderate volatility
        { base: 0, trend: 0.16, volatility: 0.07, momentum: 0.02 }
    ];
    
    // Generate daily data with open and close prices (2 points per trading day)
    const generateDailyData = (pattern, startDate, endDate) => {
        const data = [];
        const timestamps = [];
        
        let currentDate = new Date(startDate);
        let currentValue = pattern.base;
        let dayCount = 0;
        
        // Market hours: 9:30 AM - 4:00 PM ET
        const marketOpenHour = 9;
        const marketOpenMinute = 30;
        const marketCloseHour = 16;
        
        while (currentDate <= endDate) {
            const dayOfWeek = currentDate.getDay();
            
            // Only include weekdays (Monday = 1, Friday = 5)
            if (dayOfWeek >= 1 && dayOfWeek <= 5) {
                // Calculate base value for this day with trend, momentum, and volatility
                const daysSinceStart = dayCount;
                const trendComponent = daysSinceStart * pattern.trend / 100;
                const momentumComponent = daysSinceStart * pattern.momentum / 100;
                const dailyVolatility = (Math.random() - 0.5) * pattern.volatility;
                
                const baseValue = pattern.base + trendComponent + momentumComponent + dailyVolatility;
                
                // Open price: base value with small random variation
                const openVariation = (Math.random() - 0.5) * pattern.volatility * 0.2;
                const openPrice = baseValue + openVariation;
                
                // Close price: open price with intraday movement (can be up or down)
                const intradayMove = (Math.random() - 0.5) * pattern.volatility * 0.8; // Larger variation for close
                const closePrice = openPrice + intradayMove;
                
                // Open price timestamp (9:30 AM)
                const openTimestamp = new Date(currentDate);
                openTimestamp.setHours(marketOpenHour, marketOpenMinute, 0, 0);
                
                // Close price timestamp (4:00 PM)
                const closeTimestamp = new Date(currentDate);
                closeTimestamp.setHours(marketCloseHour, 0, 0, 0);
                
                // Add open price
                data.push(parseFloat(openPrice.toFixed(2)));
                timestamps.push(openTimestamp.getTime());
                
                // Add close price
                data.push(parseFloat(closePrice.toFixed(2)));
                timestamps.push(closeTimestamp.getTime());
                
                dayCount++;
            }
            
            // Move to next day
            currentDate.setDate(currentDate.getDate() + 1);
        }
        
        return { data, timestamps };
    };
    
    // Generate mock performance data for each stock
    const stockData = managers.map((manager, index) => {
        const symbol = manager.stockSymbol;
        const pattern = stockPatterns[index] || stockPatterns[0];
        
        const { data, timestamps } = generateDailyData(pattern, firstTradingDay, mockEndDate);
        
        return {
            name: manager.name,
            symbol: symbol,
            data: data,
            timestamps: timestamps
        };
    });
    
    return {
        months: monthLabels,
        data: stockData
    };
}

// Generate mock current stock data for leaderboard
// This should match the latest values from the mock chart data
function generateMockCurrentData() {
    const managers = loadManagersFromConfig();
    const today = new Date();
    
    // Calculate approximate YTD values based on the chart data patterns
    // These are derived from the stock patterns and current date
    // For mock data, simulate being a few weeks into 2026
    const yearStart = new Date(2026, 0, 1);
    const actualDaysSinceStart = Math.floor((today - yearStart) / (1000 * 60 * 60 * 24));
    // If we're before 2026, use a simulated number of days (e.g., 14 days into 2026)
    const daysSinceStart = actualDaysSinceStart < 0 ? 14 : Math.max(0, actualDaysSinceStart);
    
    // Stock patterns (same as in generateMockChartData)
    const stockPatterns = [
        { base: 0, trend: 0.15, volatility: 0.08, momentum: 0.02 },  // Daniel - NBIS
        { base: 0, trend: 0.20, volatility: 0.15, momentum: 0.03 },  // Sam - NVDA
        { base: 0, trend: 0.10, volatility: 0.04, momentum: 0.01 }, // Szklarek - WY
        { base: 0, trend: 0.18, volatility: 0.06, momentum: 0.025 }, // Cale - NVO
        { base: 0, trend: 0.08, volatility: 0.12, momentum: -0.01 }, // Charlie - TSLA
        { base: 0, trend: 0.08, volatility: 0.03, momentum: 0.008 }, // Kruse - AMTM
        { base: 0, trend: 0.22, volatility: 0.10, momentum: 0.02 },  // Kyle - PLTR
        { base: 0, trend: 0.12, volatility: 0.05, momentum: 0.015 }, // Adam - JPM
        { base: 0, trend: 0.14, volatility: 0.05, momentum: 0.018 }, // Carson - AMZN
        { base: 0, trend: 0.09, volatility: 0.03, momentum: 0.01 },  // Grant - WM
        { base: 0, trend: 0.07, volatility: 0.03, momentum: 0.008 }, // Nick - PM
        { base: 0, trend: 0.16, volatility: 0.07, momentum: 0.02 }   // Pierino - CRCL
    ];
    
    // Generate mock data for each manager
    const results = managers.map((manager, index) => {
        const symbol = manager.stockSymbol;
        const pattern = stockPatterns[index] || stockPatterns[0];
        
        // Calculate YTD percentage based on pattern
        const trendComponent = daysSinceStart * pattern.trend / 100;
        const momentumComponent = daysSinceStart * pattern.momentum / 100;
        const dailyVolatility = (Math.random() - 0.5) * pattern.volatility;
        const ytdPercent = pattern.base + trendComponent + momentumComponent + dailyVolatility;
        
        // Calculate mock prices (using a base price and YTD change)
        const basePrice = 100; // Base price for calculation
        const currentPrice = basePrice * (1 + ytdPercent / 100);
        
        // Calculate 1d change (small variation from YTD, typically close to YTD early in year)
        const change1d = ytdPercent + (Math.random() - 0.5) * 0.3;
        
        // Calculate 1m and 3m (only if enough time has passed)
        let change1m = null;
        let change3m = null;
        
        if (daysSinceStart >= 30) {
            // Approximate 1m as slightly less than YTD (since we're early in the year)
            const oneMonthTrend = Math.max(0, daysSinceStart - 30) * pattern.trend / 100;
            const oneMonthMomentum = Math.max(0, daysSinceStart - 30) * pattern.momentum / 100;
            change1m = pattern.base + oneMonthTrend + oneMonthMomentum + (Math.random() - 0.5) * pattern.volatility;
        }
        
        if (daysSinceStart >= 90) {
            // Approximate 3m as proportionally less than YTD
            const threeMonthTrend = Math.max(0, daysSinceStart - 90) * pattern.trend / 100;
            const threeMonthMomentum = Math.max(0, daysSinceStart - 90) * pattern.momentum / 100;
            change3m = pattern.base + threeMonthTrend + threeMonthMomentum + (Math.random() - 0.5) * pattern.volatility;
        }
        
        return {
            name: manager.name,
            symbol: symbol,
            currentPrice: parseFloat(currentPrice.toFixed(2)),
            changePercent: parseFloat(ytdPercent.toFixed(2)),
            change1d: parseFloat(change1d.toFixed(2)),
            change1m: change1m !== null ? parseFloat(change1m.toFixed(2)) : null,
            change3m: change3m !== null ? parseFloat(change3m.toFixed(2)) : null
        };
    });
    
    // Sort by YTD percentage (descending)
    results.sort((a, b) => {
        const aPercent = a.changePercent || -Infinity;
        const bPercent = b.changePercent || -Infinity;
        return bPercent - aPercent;
    });
    
    return results;
}

module.exports = {
    loadManagersFromConfig,
    getHistoricalPrice,
    getBaselinePrices,
    getIntradayData,
    generateMockChartData,
    generateMockCurrentData,
    isMarketOpen,
    isDuringMarketHours,
    shouldUseCache,
    shouldUseCacheSync,
    getCachedStockData,
    setCachedStockData,
    getLastUpdate,
    CACHE_KEYS,
    stockDataCache
};

