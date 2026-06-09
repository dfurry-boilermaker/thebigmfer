const express = require('express');
const path = require('path');
const fs = require('fs');
const YahooFinance = require('yahoo-finance2').default;
const yahooFinance = new YahooFinance();
const { getYTDDividends, getBaselinePrices } = require('./api/utils');

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
            if (bestQuote) {
                return bestQuote.close;
            }
            // Fallback: return the first available close price
            const firstValid = chartData.quotes.find(q => q.close !== null);
            return firstValid ? firstValid.close : null;
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

// API Routes

// Get current stock prices and performance
app.get('/api/stocks/current', async (req, res) => {
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
        const results = await Promise.all(managers.map(async (manager, index) => {
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
            const yearStart = new Date(2026, 0, 1);
            const today = new Date();
            const daysSinceStart = Math.floor((today - yearStart) / (1000 * 60 * 60 * 24));

            let change1m = null;
            let change3m = null;

            // Calculate 1m change if at least 30 days have passed
            if (daysSinceStart >= 30) {
                const oneMonthAgo = new Date(today);
                oneMonthAgo.setDate(today.getDate() - 30);
                const oneMonthPrice = await getHistoricalPrice(symbol, oneMonthAgo.toISOString().split('T')[0]);
                if (oneMonthPrice && oneMonthPrice > 0) {
                    change1m = ((currentPrice - oneMonthPrice) / oneMonthPrice) * 100;
                }
            }

            // Calculate 3m change if at least 90 days have passed
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
                change1m: change1m,
                change3m: change3m,
                analysis: manager.analysis || null // Include analysis from managers.json
            };
        }));
        
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
        
        // Get baseline prices using the same method as stocks (Dec 31, 2025)
        // This ensures consistency and proper caching
        const indexSymbols = indexes.map(idx => idx.symbol);
        const baselinePrices = await getBaselinePrices(indexSymbols);
        
        // Fetch current quotes
        const results = await Promise.all(indexes.map(async (index, indexIdx) => {
            try {
                // Fetch current quote
                const quote = await yahooFinance.quote(index.symbol);
                const currentQuote = Array.isArray(quote) ? quote[0] : quote;
                const baselinePrice = baselinePrices[indexIdx];
                
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
                
                // Get current price - use same logic as stocks endpoint
                // Prioritize regularMarketPrice (current market price)
                const currentPrice = currentQuote.regularMarketPrice || currentQuote.price || currentQuote.regularMarketPreviousClose || 0;
                const previousClose = currentQuote.regularMarketPreviousClose || baselinePrice || currentPrice;
                
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
                // Use the same calculation as stocks (price appreciation only, no dividends for indexes)
                // Formula: ((Current Price - Baseline Price) / Baseline Price) * 100
                const ytdChange = baselinePrice > 0 
                    ? ((currentPrice - baselinePrice) / baselinePrice) * 100 
                    : 0;
                
                // Calculate 1d change - use same logic as stocks
                let change1d = null;
                if (previousClose && previousClose > 0) {
                    change1d = ((currentPrice - previousClose) / previousClose) * 100;
                } else if (baselinePrice && baselinePrice > 0) {
                    // Use baseline if previousClose not available (first trading day)
                    change1d = ((currentPrice - baselinePrice) / baselinePrice) * 100;
                }
                
                // Detailed logging for debugging
                console.log(`\n=== ${index.symbol} (${index.name}) YTD Calculation ===`);
                console.log(`Baseline Date: Dec 31, 2025 (or last trading day of 2025)`);
                console.log(`Baseline Price: ${baselinePrice}`);
                console.log(`Current Price: ${currentPrice}`);
                console.log(`Previous Close: ${previousClose}`);
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
        res.status(500).json({ error: 'Failed to fetch index data' });
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

