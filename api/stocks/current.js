const YahooFinance = require('yahoo-finance2').default;
const yahooFinance = new YahooFinance();
const {
    loadManagersFromConfig,
    getBaselinePrices,
    computeManagerResult,
    isRateLimitError,
    shouldUseCache,
    getCachedStockData,
    setCachedStockData,
    getLastUpdate,
    CACHE_KEYS,
    isMarketOpen
} = require('../utils');

module.exports = async (req, res) => {
    // Set CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }
    
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }
    
    // Check if we should use cached data (market is closed or rate limited)
    // Allow bypassing cache with ?refresh=true query param for testing
    const forceRefresh = req.query && req.query.refresh === 'true';
    const useCache = !forceRefresh && await shouldUseCache();
    if (useCache) {
        const cachedData = await getCachedStockData(CACHE_KEYS.CURRENT);
        if (cachedData) {
            return res.status(200).json(cachedData);
        }
    }
    
    try {
        const managers = loadManagersFromConfig();
        const symbols = managers.map(m => m.stockSymbol);
        
        // Check for rate limiting by trying a single quote first
        let isRateLimited = false;
        try {
            const testQuote = await yahooFinance.quote(symbols[0]);
            if (!testQuote || !testQuote.regularMarketPrice) {
                isRateLimited = true;
            }
        } catch (testError) {
            if (isRateLimitError(testError)) {
                isRateLimited = true;
            }
        }
        
        // If rate limited and we have cache, use it
        if (isRateLimited) {
            const cachedData = await getCachedStockData(CACHE_KEYS.CURRENT);
            if (cachedData && Array.isArray(cachedData) && cachedData.length > 0 && cachedData.some(r => r.changePercent !== null)) {
                return res.status(200).json(cachedData);
            } else {
                // Return 503 Service Unavailable if we can't get data and have no valid cache
                return res.status(503).json({ error: 'Service temporarily unavailable. Please try again later.' });
            }
        }
        
        // Fetch current quotes
        let quotes = [];
        try {
            // Try fetching all at once first
            const result = await yahooFinance.quote(symbols);
            quotes = Array.isArray(result) ? result : [result];
        } catch (error) {
            // Check if it's a rate limit error
            if (isRateLimitError(error)) {
                const cachedData = await getCachedStockData(CACHE_KEYS.CURRENT);
                if (cachedData) {
                    return res.status(200).json(cachedData);
                }
            }
            // Fallback: fetch individually
            try {
                quotes = await Promise.all(
                    symbols.map(async (symbol) => {
                        try {
                            const result = await yahooFinance.quote(symbol);
                            return Array.isArray(result) ? result[0] : result;
                        } catch (err) {
                            return null;
                        }
                    })
                );
                quotes = quotes.filter(q => q !== null);
                
                // If we got no quotes due to rate limiting, use cache
                if (quotes.length === 0) {
                    const cachedData = await getCachedStockData(CACHE_KEYS.CURRENT);
                    if (cachedData && Array.isArray(cachedData) && cachedData.length > 0 && cachedData.some(r => r.changePercent !== null)) {
                        return res.status(200).json(cachedData);
                    }
                }
            } catch (fallbackError) {
                console.error('All quote fetches failed:', fallbackError);
                quotes = [];
            }
        }
        
        // Get baseline prices (Dec 31, 2025) - uses permanent cache
        const baselinePrices = await getBaselinePrices(symbols);
        
        // Create a map of symbol to quote
        const quoteMap = {};
        quotes.forEach(quote => {
            quoteMap[quote.symbol] = quote;
        });
        
        // Check if we have any valid quotes before proceeding
        if (quotes.length === 0) {
            const cachedData = await getCachedStockData(CACHE_KEYS.CURRENT);
            if (cachedData && Array.isArray(cachedData) && cachedData.length > 0 && cachedData.some(r => r.changePercent !== null)) {
                return res.status(200).json(cachedData);
            }
            return res.status(503).json({ error: 'Unable to fetch stock data. Please try again later.' });
        }
        
        // Calculate performance for each manager
        const results = await Promise.all(managers.map((manager, index) =>
            computeManagerResult(manager, quoteMap[manager.stockSymbol], baselinePrices[index])
        ));

        // Filter out entries without valid data
        const validResults = results.filter(r => r.changePercent !== null);
        
        // If we have no valid results, try cache or return error
        if (validResults.length === 0) {
            const cachedData = await getCachedStockData(CACHE_KEYS.CURRENT);
            if (cachedData && Array.isArray(cachedData) && cachedData.length > 0 && cachedData.some(r => r.changePercent !== null)) {
                return res.status(200).json(cachedData);
            }
            return res.status(503).json({ error: 'Unable to fetch stock data. Please try again later.' });
        }
        
        // Sort by YTD percentage (descending)
        validResults.sort((a, b) => {
            const aPercent = a.changePercent || -Infinity;
            const bPercent = b.changePercent || -Infinity;
            return bPercent - aPercent;
        });
        
        // Cache the results if we got valid data (even during market hours)
        if (validResults.length > 0 && validResults.some(r => r.changePercent !== null && r.currentPrice > 0)) {
            // Calculate TTL based on market hours
            // During market hours: 30 minutes (1800 seconds)
            // After market hours: 24 hours (86400 seconds)
            const ttlSeconds = isMarketOpen() ? 1800 : 86400;
            await setCachedStockData(CACHE_KEYS.CURRENT, validResults, ttlSeconds);
        }
        
        res.status(200).json(validResults);
    } catch (error) {
        console.error('Error fetching current stocks:', error);
        
        // If we have cached data, return it even on error
        const cachedData = await getCachedStockData(CACHE_KEYS.CURRENT);
        if (cachedData && Array.isArray(cachedData) && cachedData.length > 0 && cachedData.some(r => r.changePercent !== null)) {
            return res.status(200).json(cachedData);
        }
        
        // If no valid cache, return error response
        res.status(503).json({ error: 'Failed to fetch stock data. Please try again later.' });
    }
};

