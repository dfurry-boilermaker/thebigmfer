const YahooFinance = require('yahoo-finance2').default;
const yahooFinance = new YahooFinance();
const { 
    loadManagersFromConfig, 
    getBaselinePrices, 
    getIntradayData, 
    shouldUseCache, 
    getCachedStockData, 
    setCachedStockData, 
    CACHE_KEYS,
    isMarketOpen, 
    isDuringMarketHours,
    isTradingDay
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
    
    try {
        // Check if we should use cached data (market is closed)
        const useCache = await shouldUseCache();
        if (useCache) {
            const cachedData = await getCachedStockData(CACHE_KEYS.MONTHLY);
            if (cachedData) {
                return res.status(200).json(cachedData);
            }
        }
        
        const managers = loadManagersFromConfig();
        const symbols = managers.map(m => m.stockSymbol);
        
        // Get baseline prices (Dec 31, 2025) - uses permanent cache
        const baselinePrices = await getBaselinePrices(symbols);
        
        const today = new Date();
        const todayEnd = new Date(today);
        todayEnd.setHours(23, 59, 59, 999);
        
        // Generate month labels for x-axis (simplified - just show months that have data)
        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        const currentMonth = today.getMonth();
        const currentDay = today.getDate();
        const monthLabels = [];
        
        // For past months, use just month name
        for (let i = 0; i < currentMonth; i++) {
            monthLabels.push(months[i]);
        }
        
        // For current month, include the specific day (e.g., "Jan 2")
        if (currentMonth >= 0) {
            monthLabels.push(`${months[currentMonth]} ${currentDay}`);
        }
        
        // Fetch historical data for each stock
        const stockDataPromises = managers.map(async (manager, index) => {
            const symbol = manager.stockSymbol;
            const baselinePrice = baselinePrices[index];
            
            if (!baselinePrice) {
                return {
                    name: manager.name,
                    symbol: symbol,
                    data: [],
                    timestamps: []
                };
            }
            
            try {
                // First trading day of 2026 is Jan 2, 2026
                const firstTradingDay = new Date(2026, 0, 2); // Jan 2, 2026
                
                // Only fetch **daily** data from Jan 2, 2026 to today
                const data = [];
                const timestamps = [];
                
                // Use daily historical data (1d interval) to minimize API load
                const history = await yahooFinance.historical(symbol, {
                    period1: Math.floor(firstTradingDay.getTime() / 1000),
                    period2: Math.floor(todayEnd.getTime() / 1000),
                    interval: '1d'
                });
                
                if (history && history.length > 0) {
                    // Sort daily data by date
                    history.sort((a, b) => a.date.getTime() - b.date.getTime());
                    
                    history.forEach(entry => {
                        const entryDate = entry.date instanceof Date ? entry.date : new Date(entry.date);
                        const entryTimestamp = entryDate.getTime();
                        
                        // Only include data from Jan 2, 2026 onwards and on trading days
                        if (entryTimestamp >= firstTradingDay.getTime() && isTradingDay(entryDate) && entry.close !== null && entry.close !== undefined) {
                            const percentChange = ((entry.close - baselinePrice) / baselinePrice) * 100;
                            data.push(percentChange);
                            timestamps.push(entryTimestamp);
                        }
                    });
                }
                
                return {
                    name: manager.name,
                    symbol: symbol,
                    data: data,
                    timestamps: timestamps
                };
            } catch (error) {
                console.error(`Error fetching historical data for ${symbol}:`, error.message);
                return {
                    name: manager.name,
                    symbol: symbol,
                    data: [],
                    timestamps: []
                };
            }
        });
        
        const stockData = await Promise.all(stockDataPromises);
        
        // Filter out entries with no data
        const validStockData = stockData.filter(stock => stock.data && stock.data.length > 0);
        
        // If we have no valid data, try cache or return error
        if (validStockData.length === 0) {
            const cachedData = await getCachedStockData(CACHE_KEYS.MONTHLY);
            if (cachedData && cachedData.data && Array.isArray(cachedData.data) && cachedData.data.length > 0) {
                return res.status(200).json(cachedData);
            }
            return res.status(503).json({ error: 'Unable to fetch chart data. Please try again later.' });
        }
        
        const responseData = {
            months: monthLabels,
            data: validStockData
        };
        
        // Cache the results (always cache, with appropriate TTL)
        // Calculate TTL based on market hours
        // During market hours: 30 minutes (1800 seconds)
        // After market hours: 24 hours (86400 seconds)
        const ttlSeconds = isMarketOpen() ? 1800 : 86400;
        await setCachedStockData(CACHE_KEYS.MONTHLY, responseData, ttlSeconds);
        
        res.status(200).json(responseData);
    } catch (error) {
        console.error('Error fetching monthly stocks:', error);
        
        // If we have cached data, return it even on error
        const cachedData = await getCachedStockData(CACHE_KEYS.MONTHLY);
        if (cachedData && cachedData.data && Array.isArray(cachedData.data) && cachedData.data.length > 0) {
            return res.status(200).json(cachedData);
        }
        
        res.status(503).json({ error: 'Failed to fetch monthly stock data. Please try again later.' });
    }
};

