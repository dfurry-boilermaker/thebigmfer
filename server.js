const express = require('express');
const path = require('path');
const fs = require('fs');
const YahooFinance = require('yahoo-finance2').default;
const yahooFinance = new YahooFinance();
const { generateMockCurrentData, getYTDDividends, getHistoricalPrice, getBaselinePrices } = require('./api/utils');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.static('public'));

// CORS middleware
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
    next();
});

// Load managers from JSON file
function loadManagersFromConfig() {
    try {
        const configPath = path.join(__dirname, 'managers.json');
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

// Get intraday/hourly data for a symbol
async function getIntradayData(symbol, startDate, endDate, interval = '1h') {
    try {
        // Use chart() method for intraday data (supports hourly intervals)
        const chartData = await yahooFinance.chart(symbol, {
            period1: Math.floor(startDate.getTime() / 1000),
            period2: Math.floor(endDate.getTime() / 1000),
            interval: interval
        });
        
        if (chartData && chartData.quotes && chartData.quotes.length > 0) {
            // Convert chart format to historical format for consistency
            return chartData.quotes.map(quote => {
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
                return quote.date && quote.close !== null && quote.close !== undefined;
            });
        }
        return null;
    } catch (error) {
        // Intraday data not available, fallback to daily
        return null;
    }
}

// Generate mock chart data
function generateMockChartData() {
    const managers = loadManagersFromConfig();
    const currentDate = new Date();
    const currentYear = 2026;
    const currentMonth = currentDate.getMonth(); // 0-11
    const currentDay = currentDate.getDate();
    
    // Mock data goes up to July 17, 2026
    const mockEndMonth = 6; // July (0-indexed)
    const mockEndDay = 17;
    
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const monthLabels = [];
    for (let i = 0; i <= mockEndMonth; i++) {
        monthLabels.push(months[i]);
    }
    
    // Generate mock performance data for each stock
    const stockData = managers.map((manager, index) => {
        const symbol = manager.stockSymbol;
        const data = [0]; // Start at 0% (baseline)
        
        // Generate month-end values for Jan-Jun
        const monthEndValues = [
            19.6,   // Jan
            20.91,  // Feb
            19.28,  // Mar
            20.83,  // Apr
            23.25,  // May
            20.71   // Jun
        ];
        
        // Add some variation based on stock index
        const variation = (index % 3 - 1) * 2; // -2, 0, or 2
        
        for (let i = 0; i < monthEndValues.length; i++) {
            data.push(monthEndValues[i] + variation);
        }
        
        // Generate daily data for July (up to July 17)
        const julyDaily = [21.24, 21.17, 21.53, 22.11, 22.78, 22.43, 22.22, 22.36, 21.93, 22.59, 22.16, 21.7];
        for (let i = 0; i < julyDaily.length; i++) {
            data.push(julyDaily[i] + variation);
        }
        
        return {
            name: manager.name,
            symbol: symbol,
            data: data
        };
    });
    
    return {
        months: monthLabels,
        data: stockData
    };
}

// API Routes

// Get current stock prices and performance
app.get('/api/stocks/current', async (req, res) => {
    // Check if using mock data
    const useMock = req.query.mock === 'true';
    if (useMock) {
        const mockData = generateMockCurrentData();
        return res.status(200).json(mockData);
    }
    
    try {
        const managers = loadManagersFromConfig();
        const symbols = managers.map(m => m.stockSymbol);
        
        // Fetch current quotes
        let quotes = [];
        try {
            // Try fetching all at once first
            const result = await yahooFinance.quote(symbols);
            quotes = Array.isArray(result) ? result : [result];
        } catch (error) {
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
            } catch (fallbackError) {
                quotes = [];
            }
        }
        
        // Get baseline prices (Dec 31, 2025)
        const baselineDate = '2025-12-31';
        const baselinePromises = symbols.map(symbol => 
            getHistoricalPrice(symbol, baselineDate)
        );
        const baselinePrices = await Promise.all(baselinePromises);
        
        // Create a map of symbol to quote
        const quoteMap = {};
        quotes.forEach(quote => {
            quoteMap[quote.symbol] = quote;
        });
        
        // Calculate performance for each manager
        const results = managers.map((manager, index) => {
            const symbol = manager.stockSymbol;
            const quote = quoteMap[symbol];
            const baselinePrice = baselinePrices[index];
            
            if (!quote || !baselinePrice) {
                return {
                    name: manager.name,
                    symbol: symbol,
                    currentPrice: 0,
                    changePercent: null,
                    change1d: null,
                    change1m: null,
                    change3m: null,
                    analysis: manager.analysis || null // Include analysis even when no quote
                };
            }
            
            const currentPrice = quote.regularMarketPrice || quote.price || quote.regularMarketPreviousClose || 0;
            const previousClose = quote.regularMarketPreviousClose || baselinePrice || currentPrice;
            
            // Calculate YTD percentage change (price appreciation)
            const ytdPriceChange = baselinePrice > 0 
                ? ((currentPrice - baselinePrice) / baselinePrice) * 100 
                : 0;
            
            // Get YTD dividends (as percentage) - use shared utility function
            const ytdDividendYield = await getYTDDividends(symbol, baselinePrice);
            
            // Calculate total return (price change + dividends)
            const ytdChange = ytdPriceChange + ytdDividendYield;
            
            // Calculate 1d change
            let change1d = null;
            if (previousClose && previousClose > 0) {
                change1d = ((currentPrice - previousClose) / previousClose) * 100;
            } else if (baselinePrice && baselinePrice > 0) {
                // Use baseline if previousClose not available (first trading day)
                change1d = ((currentPrice - baselinePrice) / baselinePrice) * 100;
            }
            
            // Calculate 1m and 3m changes (only if enough time has passed in 2026)
            // Note: Historical data fetching for 1m/3m is not implemented yet
            const change1m = null;
            const change3m = null;
            
            return {
                name: manager.name,
                symbol: symbol,
                currentPrice: currentPrice,
                changePercent: ytdChange,
                change1d: change1d,
                change1m: change1m,
                change3m: change3m,
                analysis: manager.analysis || null // Include analysis from managers.json
            };
        });
        
        // Sort by YTD percentage (descending)
        results.sort((a, b) => {
            const aPercent = a.changePercent || -Infinity;
            const bPercent = b.changePercent || -Infinity;
            return bPercent - aPercent;
        });
        
        res.json(results);
    } catch (error) {
        console.error('Error fetching current stocks:', error);
        res.status(500).json({ error: 'Failed to fetch stock data' });
    }
});

// Get monthly/daily stock performance data
app.get('/api/stocks/monthly', async (req, res) => {
    try {
        const useMock = req.query.mock === 'true';
        
        if (useMock) {
            const { generateMockChartData } = require('./api/utils');
            const mockData = generateMockChartData();
            return res.json(mockData);
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
        for (let i = 0; i <= currentMonth; i++) {
            monthLabels.push(months[i]);
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
                // Fetch historical data from year start to today
                const historical = await yahooFinance.historical(symbol, {
                    period1: Math.floor(yearStart.getTime() / 1000),
                    period2: Math.floor(today.getTime() / 1000),
                });
                
                if (!historical || historical.length === 0) {
                    return {
                        name: manager.name,
                        symbol: symbol,
                        data: [],
                        timestamps: []
                    };
                }
                
                // Sort by date (ascending)
                historical.sort((a, b) => new Date(a.date) - new Date(b.date));
                
                // Calculate percentage changes from baseline
                // Note: We keep baseline for calculation but won't display it (chart starts Jan 2, 2026)
                const data = []; // Start with empty array, will add Jan 2+ data
                const timestamps = [];
                
                // First trading day of 2026 is Jan 2, 2026
                const firstTradingDay = new Date(2026, 0, 2); // Jan 2, 2026
                
                // Calculate date ranges for hourly vs daily data
                const sevenDaysAgo = new Date(today);
                sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
                sevenDaysAgo.setHours(0, 0, 0, 0);
                
                const todayEnd = new Date(today);
                todayEnd.setHours(23, 59, 59, 999);
                
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
                
                // Add month-end data points for past months (only if after Jan 2, 2026)
                for (let i = 0; i < currentMonth; i++) {
                    if (monthEndPrices[i] !== undefined) {
                        const monthEndDate = new Date(2026, i + 1, 0);
                        // Only include if it's on or after Jan 2, 2026
                        if (monthEndDate >= firstTradingDay) {
                            const percentChange = ((monthEndPrices[i] - baselinePrice) / baselinePrice) * 100;
                            data.push(percentChange);
                            timestamps.push(monthEndDate.getTime());
                        }
                    }
                }
                
                // For current month, use daily data up to 7 days ago (only if on or after Jan 2, 2026)
                const currentMonthData = historical.filter(entry => {
                    const entryDate = new Date(entry.date);
                    return entryDate.getMonth() === currentMonth && 
                           entryDate < sevenDaysAgo && 
                           entryDate >= firstTradingDay;
                });
                
                currentMonthData.forEach(entry => {
                    const entryDate = new Date(entry.date);
                    if (entryDate >= firstTradingDay) {
                        const percentChange = ((entry.close - baselinePrice) / baselinePrice) * 100;
                        data.push(percentChange);
                        timestamps.push(entryDate.getTime());
                    }
                });
                
                // Try to fetch hourly data for the last 7 days (including today)
                try {
                    const intradayData = await getIntradayData(symbol, sevenDaysAgo, todayEnd, '1h');
                    
                    if (intradayData && intradayData.length > 0) {
                        intradayData.sort((a, b) => a.date.getTime() - b.date.getTime());
                        
                        const lastDailyTimestamp = timestamps.length > 0 ? timestamps[timestamps.length - 1] : 0;
                        let addedCount = 0;
                        
                        intradayData.forEach(entry => {
                            const entryDate = entry.date;
                            const entryTimestamp = entryDate.getTime();
                            
                            // Only include data from Jan 2, 2026 onwards
                            if (entryTimestamp >= firstTradingDay.getTime() && entryTimestamp > lastDailyTimestamp) {
                                // Calculate start of hour timestamp (for open price)
                                const hourStart = new Date(entryDate);
                                hourStart.setMinutes(0);
                                hourStart.setSeconds(0);
                                hourStart.setMilliseconds(0);
                                const hourStartTimestamp = hourStart.getTime();
                                
                                // Add open price at the start of the hour (if available)
                                if (entry.open !== null && entry.open !== undefined && hourStartTimestamp >= firstTradingDay.getTime() && hourStartTimestamp > lastDailyTimestamp) {
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
                    } else {
                        // Fallback to daily data for last 7 days
                        const recentDailyData = historical.filter(entry => {
                            const entryDate = new Date(entry.date);
                            return entryDate >= sevenDaysAgo;
                        });
                        
                        recentDailyData.forEach(entry => {
                            const entryDate = new Date(entry.date);
                            // Only include data from Jan 2, 2026 onwards
                            if (entryDate >= firstTradingDay) {
                                const percentChange = ((entry.close - baselinePrice) / baselinePrice) * 100;
                                data.push(percentChange);
                                timestamps.push(entryDate.getTime());
                            }
                        });
                    }
                } catch (intradayError) {
                    // Hourly data not available, use daily data
                    const recentDailyData = historical.filter(entry => {
                        const entryDate = new Date(entry.date);
                        return entryDate >= sevenDaysAgo;
                    });
                    
                    recentDailyData.forEach(entry => {
                        const entryDate = new Date(entry.date);
                        // Only include data from Jan 2, 2026 onwards
                        if (entryDate >= firstTradingDay) {
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
                    data: [],
                    timestamps: []
                };
            }
        });
        
        const stockData = await Promise.all(stockDataPromises);
        
        res.json({
            months: monthLabels,
            data: stockData
        });
    } catch (error) {
        console.error('Error fetching monthly stocks:', error);
        res.status(500).json({ error: 'Failed to fetch monthly stock data' });
    }
});

// Manager analyses endpoint
app.get('/api/analyses', (req, res) => {
    try {
        const managers = loadManagersFromConfig();
        
        // Convert managers array to analyses object format
        const analyses = {};
        managers.forEach(manager => {
            if (manager.analysis) {
                analyses[manager.name] = {
                    stockSymbol: manager.stockSymbol,
                    analysis: manager.analysis
                };
            }
        });
        
        res.json({ analyses });
    } catch (error) {
        console.error('Error loading manager analyses:', error);
        // Return empty object if file doesn't exist or can't be read
        res.json({ analyses: {} });
    }
});

// Get benchmarks (SPY, QQQ, DIA, DX-Y.NYB)
app.get('/api/indexes', async (req, res) => {
    try {
        const indexes = [
            { symbol: 'SPY', name: 'S&P 500' },
            { symbol: 'QQQ', name: 'Nasdaq 100' },
            { symbol: 'DIA', name: 'Dow Jones' },
            { symbol: 'DX-Y.NYB', name: 'US Dollar' }
        ];
        
        // Baseline date: Dec 31, 2025 (last trading day of 2025 for 2026 YTD calculation)
        const baselineDate = '2025-12-31';
        
        // Fetch current quotes and baseline prices
        const results = await Promise.all(indexes.map(async (index) => {
            try {
                // Fetch current quote
                const quote = await yahooFinance.quote(index.symbol);
                const currentQuote = Array.isArray(quote) ? quote[0] : quote;
                
                if (!currentQuote) {
                    console.error(`${index.symbol}: No quote data available`);
                    return {
                        symbol: index.symbol,
                        name: index.name,
                        currentPrice: null,
                        changePercent: null,
                        change1d: null
                    };
                }
                
                // Get baseline price from Dec 31, 2025
                let baselinePrice = await getHistoricalPrice(index.symbol, baselineDate);
                
                // If Dec 31, 2025 doesn't work (holiday/weekend), get the last trading day of December 2025
                if (!baselinePrice) {
                    console.warn(`${index.symbol}: Dec 31, 2025 not available, trying to get last trading day of Dec 2025`);
                    try {
                        const historical = await yahooFinance.historical(index.symbol, {
                            period1: Math.floor(new Date('2025-12-01').getTime() / 1000),
                            period2: Math.floor(new Date('2025-12-31').getTime() / 1000) + 86400,
                        });
                        if (historical && historical.length > 0) {
                            // Sort by date and get the last entry (last trading day of December)
                            historical.sort((a, b) => new Date(a.date) - new Date(b.date));
                            baselinePrice = historical[historical.length - 1].close;
                            console.log(`${index.symbol}: Using last trading day of Dec 2025: ${historical[historical.length - 1].date}, price: ${baselinePrice}`);
                        }
                    } catch (err) {
                        console.error(`${index.symbol}: Could not get baseline from December 2025:`, err.message);
                    }
                }
                
                if (!baselinePrice) {
                    console.error(`${index.symbol}: No baseline price available`);
                    return {
                        symbol: index.symbol,
                        name: index.name,
                        currentPrice: null,
                        changePercent: null,
                        change1d: null
                    };
                }
                
                // Get current price - prioritize regularMarketPrice (current market price)
                // If market is closed, use regularMarketPreviousClose (last close)
                let currentPrice = currentQuote.regularMarketPrice;
                if (!currentPrice || currentPrice === 0) {
                    currentPrice = currentQuote.price;
                }
                if (!currentPrice || currentPrice === 0) {
                    currentPrice = currentQuote.regularMarketPreviousClose;
                }
                if (!currentPrice || currentPrice === 0) {
                    console.error(`${index.symbol}: No valid current price found`);
                    return {
                        symbol: index.symbol,
                        name: index.name,
                        currentPrice: null,
                        changePercent: null,
                        change1d: null
                    };
                }
                
                // Calculate YTD percentage change for 2026
                // Formula: ((Current Price - Baseline Price) / Baseline Price) * 100
                const ytdChange = ((currentPrice - baselinePrice) / baselinePrice) * 100;
                
                // Calculate 1d change
                const previousClose = currentQuote.regularMarketPreviousClose;
                let change1d = null;
                if (previousClose && previousClose > 0 && previousClose !== currentPrice) {
                    change1d = ((currentPrice - previousClose) / previousClose) * 100;
                }
                
                // Detailed logging for debugging
                console.log(`\n=== ${index.symbol} (${index.name}) YTD Calculation ===`);
                console.log(`Baseline Date: ${baselineDate}`);
                console.log(`Baseline Price: ${baselinePrice}`);
                console.log(`Current Price: ${currentPrice}`);
                console.log(`YTD Change: ${ytdChange.toFixed(4)}%`);
                console.log(`Calculation: (${currentPrice} - ${baselinePrice}) / ${baselinePrice} * 100 = ${ytdChange.toFixed(4)}%`);
                if (change1d !== null) {
                    console.log(`1d Change: ${change1d.toFixed(4)}%`);
                }
                console.log(`==========================================\n`);
                
                return {
                    symbol: index.symbol,
                    name: index.name,
                    currentPrice: currentPrice,
                    changePercent: ytdChange,
                    change1d: change1d
                };
            } catch (error) {
                console.error(`Error fetching data for ${index.symbol}:`, error.message);
                console.error(error.stack);
                return {
                    symbol: index.symbol,
                    name: index.name,
                    currentPrice: null,
                    changePercent: null,
                    change1d: null
                };
            }
        }));
        
        // Always return results even if some are null
        res.json(results);
    } catch (error) {
        console.error('Error fetching indexes:', error);
        console.error(error.stack);
        // Return empty results instead of error to allow frontend to show mock data
        res.json([
            { symbol: 'SPY', name: 'S&P 500', currentPrice: null, changePercent: null, change1d: null },
            { symbol: 'QQQ', name: 'Nasdaq 100', currentPrice: null, changePercent: null, change1d: null },
            { symbol: 'DX-Y.NYB', name: 'US Dollar', currentPrice: null, changePercent: null, change1d: null }
        ]);
    }
});

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Start server
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Visit http://localhost:${PORT} to view the app`);
    console.log(`Managers loaded: ${loadManagersFromConfig().length}`);
});

