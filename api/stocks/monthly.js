const YahooFinance = require('yahoo-finance2').default;
const yahooFinance = new YahooFinance();
const { 
    loadManagersFromConfig, 
    getBaselinePrices, 
    getIntradayData, 
    generateMockChartData, 
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
        const useMock = req.query.mock === 'true';
        
        if (useMock) {
            const mockData = generateMockChartData();
            return res.status(200).json(mockData);
        }
        
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
                
                // Only fetch hourly data from Jan 2, 2026 to today
                const data = [];
                const timestamps = [];
                
                try {
                    const intradayData = await getIntradayData(symbol, firstTradingDay, todayEnd, '1h');
                    
                    if (intradayData && intradayData.length > 0) {
                        // Sort intraday data by date
                        intradayData.sort((a, b) => a.date.getTime() - b.date.getTime());
                        
                        intradayData.forEach(entry => {
                            const entryDate = entry.date;
                            const entryTimestamp = entryDate.getTime();
                            
                            // Only include data from Jan 2, 2026 onwards and on trading days
                            if (entryTimestamp >= firstTradingDay.getTime() && isTradingDay(entryDate)) {
                                // Calculate start of hour timestamp (for open price)
                                const hourStart = new Date(entryDate);
                                hourStart.setMinutes(0);
                                hourStart.setSeconds(0);
                                hourStart.setMilliseconds(0);
                                const hourStartTimestamp = hourStart.getTime();
                                
                                // Add open price at the start of the hour (if available)
                                if (entry.open !== null && entry.open !== undefined && hourStartTimestamp >= firstTradingDay.getTime()) {
                                    const openPercentChange = ((entry.open - baselinePrice) / baselinePrice) * 100;
                                    data.push(openPercentChange);
                                    timestamps.push(hourStartTimestamp);
                                }
                                
                                // Add close price at the end of the hour
                                const closePercentChange = ((entry.close - baselinePrice) / baselinePrice) * 100;
                                data.push(closePercentChange);
                                timestamps.push(entryTimestamp);
                            }
                        });
                        
                        // Sort data and timestamps by timestamp to ensure chronological order
                        const dataWithTimestamps = [];
                        for (let i = 0; i < data.length; i++) {
                            if (timestamps[i]) {
                                dataWithTimestamps.push({
                                    timestamp: timestamps[i],
                                    value: data[i]
                                });
                            }
                        }
                        dataWithTimestamps.sort((a, b) => a.timestamp - b.timestamp);
                        
                        // Update data and timestamps arrays with sorted values
                        data.length = 0;
                        timestamps.length = 0;
                        dataWithTimestamps.forEach(item => {
                            data.push(item.value);
                            timestamps.push(item.timestamp);
                        });
                    }
                } catch (intradayError) {
                    // Hourly data not available, will use daily data
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
        
        const responseData = {
            months: monthLabels,
            data: stockData
        };
        
        // Cache the results (always cache, with appropriate TTL)
        // Calculate TTL based on market hours
        // During market hours: 15 minutes (900 seconds)
        // After market hours: 24 hours (86400 seconds)
        const ttlSeconds = isMarketOpen() ? 900 : 86400;
        await setCachedStockData(CACHE_KEYS.MONTHLY, responseData, ttlSeconds);
        
        res.status(200).json(responseData);
    } catch (error) {
        console.error('Error fetching monthly stocks:', error);
        
        // If we have cached data, return it even on error
        const cachedData = await getCachedStockData(CACHE_KEYS.MONTHLY);
        if (cachedData) {
            return res.status(200).json(cachedData);
        }
        
        res.status(500).json({ error: 'Failed to fetch monthly stock data', details: error.message });
    }
};

