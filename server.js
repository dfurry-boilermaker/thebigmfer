const express = require('express');
const path = require('path');
const fs = require('fs');
const yahooFinance = require('yahoo-finance2').default;

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.static('public'));

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
    try {
        const managers = loadManagersFromConfig();
        const symbols = managers.map(m => m.stockSymbol);
        
        // Fetch current quotes
        let quotes;
        try {
            quotes = await yahooFinance.quote(symbols);
        } catch (error) {
            // Fallback: fetch individually
            quotes = await Promise.all(
                symbols.map(symbol => yahooFinance.quote(symbol))
            );
            quotes = quotes.flat();
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
                    change3m: null
                };
            }
            
            const currentPrice = quote.regularMarketPrice || quote.price || 0;
            const previousClose = quote.regularMarketPreviousClose || baselinePrice;
            
            // Calculate YTD percentage change
            const ytdChange = baselinePrice > 0 
                ? ((currentPrice - baselinePrice) / baselinePrice) * 100 
                : 0;
            
            // Calculate 1d change
            let change1d = null;
            if (previousClose && previousClose > 0) {
                change1d = ((currentPrice - previousClose) / previousClose) * 100;
            } else if (baselinePrice && baselinePrice > 0) {
                // Use baseline if previousClose not available (first trading day)
                change1d = ((currentPrice - baselinePrice) / baselinePrice) * 100;
            }
            
            // Calculate 1m and 3m changes (only if enough time has passed in 2026)
            const today = new Date();
            const yearStart = new Date(2026, 0, 1);
            const daysSinceStart = Math.floor((today - yearStart) / (1000 * 60 * 60 * 24));
            
            let change1m = null;
            let change3m = null;
            
            if (daysSinceStart >= 30) {
                // Get price from 30 days ago
                const oneMonthAgo = new Date(today);
                oneMonthAgo.setDate(oneMonthAgo.getDate() - 30);
                // For now, set to null if not enough data
                // You could fetch historical data here if needed
            }
            
            if (daysSinceStart >= 90) {
                // Get price from 90 days ago
                const threeMonthsAgo = new Date(today);
                threeMonthsAgo.setDate(threeMonthsAgo.getDate() - 90);
                // For now, set to null if not enough data
            }
            
            return {
                name: manager.name,
                symbol: symbol,
                currentPrice: currentPrice,
                changePercent: ytdChange,
                change1d: change1d,
                change1m: change1m,
                change3m: change3m
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
                    data: [0]
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
                        data: [0]
                    };
                }
                
                // Sort by date (ascending)
                historical.sort((a, b) => new Date(a.date) - new Date(b.date));
                
                // Calculate percentage changes from baseline
                const data = [0]; // Baseline at 0%
                
                // Get month-end prices
                const monthEndPrices = {};
                historical.forEach(entry => {
                    const entryDate = new Date(entry.date);
                    const month = entryDate.getMonth();
                    const day = entryDate.getDate();
                    const lastDayOfMonth = new Date(entryDate.getFullYear(), month + 1, 0).getDate();
                    
                    // Store month-end price
                    if (day === lastDayOfMonth || (month === currentMonth && day === currentDay)) {
                        monthEndPrices[month] = entry.close;
                    }
                });
                
                // Add month-end data points
                for (let i = 0; i < currentMonth; i++) {
                    if (monthEndPrices[i] !== undefined) {
                        const percentChange = ((monthEndPrices[i] - baselinePrice) / baselinePrice) * 100;
                        data.push(percentChange);
                    }
                }
                
                // Add daily data for current month
                const currentMonthData = historical.filter(entry => {
                    const entryDate = new Date(entry.date);
                    return entryDate.getMonth() === currentMonth;
                });
                
                currentMonthData.forEach(entry => {
                    const percentChange = ((entry.close - baselinePrice) / baselinePrice) * 100;
                    data.push(percentChange);
                });
                
                return {
                    name: manager.name,
                    symbol: symbol,
                    data: data
                };
            } catch (error) {
                console.error(`Error fetching historical data for ${symbol}:`, error.message);
                return {
                    name: manager.name,
                    symbol: symbol,
                    data: [0]
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

// Start server
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Visit http://localhost:${PORT} to view the app`);
});

