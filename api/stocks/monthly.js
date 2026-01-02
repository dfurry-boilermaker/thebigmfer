const yahooFinance = require('yahoo-finance2').default;
const { loadManagersFromConfig, getHistoricalPrice, getIntradayData, generateMockChartData, shouldUseCache, stockDataCache, isMarketOpen, isDuringMarketHours } = require('../utils');

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
        if (shouldUseCache() && stockDataCache.monthly) {
            console.log('Market is closed, returning cached monthly data');
            return res.status(200).json(stockDataCache.monthly);
        }
        
        const managers = loadManagersFromConfig();
        const symbols = managers.map(m => m.stockSymbol);
        
        // Get baseline prices
        const baselineDate = '2025-12-31';
        const baselinePromises = symbols.map(symbol => 
            getHistoricalPrice(symbol, baselineDate)
        );
        const baselinePrices = await Promise.all(baselinePromises);
        
        const today = new Date();
        const yearStart = new Date(2026, 0, 1);
        const currentMonth = today.getMonth();
        const currentDay = today.getDate();
        
        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        const monthLabels = [];
        
        // For past months, use just month name
        for (let i = 0; i < currentMonth; i++) {
            monthLabels.push(months[i]);
        }
        
        // For current month, include the specific day (e.g., "Jan 2")
        if (currentMonth >= 0) {
            monthLabels.push(`${months[currentMonth]} ${currentDay}`);
        }
        
        // Calculate date ranges for hourly vs daily data
        // Use hourly data for the last 7 days including today, daily for older data
        const sevenDaysAgo = new Date(today);
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
        sevenDaysAgo.setHours(0, 0, 0, 0); // Start of day
        
        // Ensure today's end time includes current hour
        const todayEnd = new Date(today);
        todayEnd.setHours(23, 59, 59, 999);
        
        // Fetch historical data for each stock
        const stockDataPromises = managers.map(async (manager, index) => {
            const symbol = manager.stockSymbol;
            const baselinePrice = baselinePrices[index];
            
            if (!baselinePrice) {
                return {
                    name: manager.name,
                    symbol: symbol,
                    data: [0],
                    timestamps: [new Date(2025, 11, 31).getTime()]
                };
            }
            
            try {
                // Fetch daily historical data from year start to today
                const historical = await yahooFinance.historical(symbol, {
                    period1: Math.floor(yearStart.getTime() / 1000),
                    period2: Math.floor(today.getTime() / 1000),
                });
                
                if (!historical || historical.length === 0) {
                    return {
                        name: manager.name,
                        symbol: symbol,
                        data: [0],
                        timestamps: [new Date(2025, 11, 31).getTime()]
                    };
                }
                
                // Sort by date (ascending)
                historical.sort((a, b) => new Date(a.date) - new Date(b.date));
                
                // Calculate percentage changes from baseline
                const data = [0]; // Baseline at 0%
                const timestamps = [new Date(2025, 11, 31).getTime()]; // Dec 31, 2025 baseline
                
                // Get month-end prices for past months
                const monthEndPrices = {};
                historical.forEach(entry => {
                    const entryDate = new Date(entry.date);
                    const month = entryDate.getMonth();
                    const day = entryDate.getDate();
                    const lastDayOfMonth = new Date(entryDate.getFullYear(), month + 1, 0).getDate();
                    
                    // Store month-end price
                    if (day === lastDayOfMonth && month < currentMonth) {
                        monthEndPrices[month] = entry.close;
                    }
                });
                
                // Add month-end data points for past months
                for (let i = 0; i < currentMonth; i++) {
                    if (monthEndPrices[i] !== undefined) {
                        const percentChange = ((monthEndPrices[i] - baselinePrice) / baselinePrice) * 100;
                        data.push(percentChange);
                        // Use last day of that month
                        const monthEndDate = new Date(2026, i + 1, 0);
                        timestamps.push(monthEndDate.getTime());
                    }
                }
                
                // For current month, use daily data up to 7 days ago (to avoid overlap with hourly)
                const currentMonthData = historical.filter(entry => {
                    const entryDate = new Date(entry.date);
                    return entryDate.getMonth() === currentMonth && entryDate < sevenDaysAgo;
                });
                
                currentMonthData.forEach(entry => {
                    const entryDate = new Date(entry.date);
                    // Only include trading days (weekdays) - daily data from Yahoo Finance is already filtered to trading days
                    const day = entryDate.getDay();
                    if (day !== 0 && day !== 6) { // Not Sunday or Saturday
                        const percentChange = ((entry.close - baselinePrice) / baselinePrice) * 100;
                        data.push(percentChange);
                        timestamps.push(entryDate.getTime());
                    }
                });
                
                // Try to fetch hourly data for the last 7 days (including today)
                // This will show intraday movement for today
                try {
                    const intradayData = await getIntradayData(symbol, sevenDaysAgo, todayEnd, '1h');
                    
                    if (intradayData && intradayData.length > 0) {
                        // Sort intraday data by date
                        intradayData.sort((a, b) => a.date.getTime() - b.date.getTime());
                        
                        console.log(`Fetched ${intradayData.length} hourly data points for ${symbol}`);
                        
                        // Remove duplicates that might overlap with daily data
                        // Only include hourly data that's newer than the last daily data point
                        const lastDailyTimestamp = timestamps.length > 0 ? timestamps[timestamps.length - 1] : 0;
                        
                        let addedCount = 0;
                        intradayData.forEach(entry => {
                            const entryDate = entry.date;
                            const entryTimestamp = entryDate.getTime();
                            
                            // Only add if it's newer than the last daily point
                            if (entryTimestamp > lastDailyTimestamp) {
                                // Calculate start of hour timestamp (for open price)
                                const hourStart = new Date(entryDate);
                                hourStart.setMinutes(0);
                                hourStart.setSeconds(0);
                                hourStart.setMilliseconds(0);
                                const hourStartTimestamp = hourStart.getTime();
                                
                                // Add open price at the start of the hour (if available)
                                if (entry.open !== null && entry.open !== undefined && hourStartTimestamp > lastDailyTimestamp) {
                                    const openPercentChange = ((entry.open - baselinePrice) / baselinePrice) * 100;
                                    data.push(openPercentChange);
                                    timestamps.push(hourStartTimestamp);
                                    addedCount++;
                                }
                                
                                // Add close price at the end of the hour (entry.date is typically end of hour)
                                const closePercentChange = ((entry.close - baselinePrice) / baselinePrice) * 100;
                                data.push(closePercentChange);
                                timestamps.push(entryTimestamp);
                                addedCount++;
                            }
                        });
                        
                        // Sort data and timestamps by timestamp to ensure chronological order
                        // Create array of {timestamp, value} pairs, sort, then separate
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
                        
                        console.log(`Added ${addedCount} hourly points (open + close) for ${symbol}`);
                    } else {
                        // Fallback to daily data for last 7 days if hourly not available
                        const recentDailyData = historical.filter(entry => {
                            const entryDate = new Date(entry.date);
                            return entryDate >= sevenDaysAgo;
                        });
                        
                        recentDailyData.forEach(entry => {
                            const entryDate = new Date(entry.date);
                            // Only include trading days (weekdays)
                            const day = entryDate.getDay();
                            if (day !== 0 && day !== 6) { // Not Sunday or Saturday
                                const percentChange = ((entry.close - baselinePrice) / baselinePrice) * 100;
                                data.push(percentChange);
                                timestamps.push(entryDate.getTime());
                            }
                        });
                    }
                } catch (intradayError) {
                    // If hourly data fails, use daily data for recent period
                    console.log(`Hourly data not available for ${symbol}, using daily data:`, intradayError.message);
                    const recentDailyData = historical.filter(entry => {
                        const entryDate = new Date(entry.date);
                        return entryDate >= sevenDaysAgo;
                    });
                    
                    recentDailyData.forEach(entry => {
                        const entryDate = new Date(entry.date);
                        // Only include trading days (weekdays)
                        const day = entryDate.getDay();
                        if (day !== 0 && day !== 6) { // Not Sunday or Saturday
                            const percentChange = ((entry.close - baselinePrice) / baselinePrice) * 100;
                            data.push(percentChange);
                            timestamps.push(entryDate.getTime());
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
                    data: [0],
                    timestamps: [new Date(2025, 11, 31).getTime()]
                };
            }
        });
        
        const stockData = await Promise.all(stockDataPromises);
        
        const responseData = {
            months: monthLabels,
            data: stockData
        };
        
        // Cache the results if market is closed
        if (!isMarketOpen()) {
            stockDataCache.monthly = responseData;
            stockDataCache.lastUpdate = Date.now();
            stockDataCache.marketWasOpen = false;
            console.log('Market is closed, caching monthly data');
        }
        
        res.status(200).json(responseData);
    } catch (error) {
        console.error('Error fetching monthly stocks:', error);
        res.status(500).json({ error: 'Failed to fetch monthly stock data', details: error.message });
    }
};

