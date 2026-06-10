const express = require('express');
const YahooFinance = require('yahoo-finance2').default;
const yahooFinance = new YahooFinance();
const { loadManagersFromConfig, getHistoricalPrice, getBaselinePrices, computeManagerResult, buildDividendSummary } = require('./api/utils');

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
        
        // Get baseline prices (Dec 31, 2025) - uses permanent cache
        const baselinePrices = await getBaselinePrices(symbols);

        // Create a map of symbol to quote
        const quoteMap = {};
        quotes.forEach(quote => {
            quoteMap[quote.symbol] = quote;
        });

        // Calculate performance for each manager (shared with the Vercel endpoints)
        const results = await Promise.all(managers.map((manager, index) =>
            computeManagerResult(manager, quoteMap[manager.stockSymbol], baselinePrices[index])
        ));
        
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

// Get daily stock performance data for the YTD chart
// Same strategy as api/stocks/monthly.js (Vercel) so local dev matches production
app.get('/api/stocks/monthly', async (req, res) => {
    try {
        const managers = loadManagersFromConfig();
        const symbols = managers.map(m => m.stockSymbol);
        const baselinePrices = await getBaselinePrices(symbols);

        const today = new Date();
        const todayEnd = new Date(today);
        todayEnd.setHours(23, 59, 59, 999);
        const firstTradingDay = new Date(2026, 0, 2); // Jan 2, 2026

        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        const currentMonth = today.getMonth();
        const monthLabels = [];
        for (let i = 0; i < currentMonth; i++) monthLabels.push(months[i]);
        monthLabels.push(`${months[currentMonth]} ${today.getDate()}`);

        const stockData = await Promise.all(managers.map(async (manager, index) => {
            const symbol = manager.stockSymbol;
            const baselinePrice = baselinePrices[index];

            if (!baselinePrice) {
                return { name: manager.name, symbol, data: [], timestamps: [] };
            }

            try {
                const history = await yahooFinance.historical(symbol, {
                    period1: Math.floor(firstTradingDay.getTime() / 1000),
                    period2: Math.floor(todayEnd.getTime() / 1000),
                    interval: '1d'
                });

                if (!history || history.length === 0) {
                    return { name: manager.name, symbol, data: [], timestamps: [] };
                }

                history.sort((a, b) => new Date(a.date) - new Date(b.date));

                const data = [];
                const timestamps = [];
                for (const entry of history) {
                    if (entry.close === null || entry.close === undefined) continue;
                    const entryDate = entry.date instanceof Date ? entry.date : new Date(entry.date);
                    data.push(((entry.close - baselinePrice) / baselinePrice) * 100);
                    timestamps.push(entryDate.getTime());
                }

                return { name: manager.name, symbol, data, timestamps };
            } catch (error) {
                console.error(`Error fetching historical data for ${symbol}:`, error.message);
                return { name: manager.name, symbol, data: [], timestamps: [] };
            }
        }));

        res.json({
            months: monthLabels,
            data: stockData
        });
    } catch (error) {
        console.error('Error fetching monthly stocks:', error);
        res.status(500).json({ error: 'Failed to fetch monthly stock data' });
    }
});

// Per-manager 2026 dividend history (same logic as api/dividends.js)
app.get('/api/dividends', async (req, res) => {
    try {
        const summary = await buildDividendSummary();
        res.json(summary);
    } catch (error) {
        console.error('Error fetching dividends:', error);
        res.status(500).json({ error: 'Failed to fetch dividend data' });
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

