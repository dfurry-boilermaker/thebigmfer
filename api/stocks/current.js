const yahooFinance = require('yahoo-finance2').default;
const { loadManagersFromConfig, getHistoricalPrice } = require('../utils');

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
        const managers = loadManagersFromConfig();
        const symbols = managers.map(m => m.stockSymbol);
        
        // Fetch current quotes
        let quotes = [];
        try {
            // Try fetching all at once first
            const result = await yahooFinance.quote(symbols);
            quotes = Array.isArray(result) ? result : [result];
        } catch (error) {
            console.log('Batch quote failed, fetching individually:', error.message);
            // Fallback: fetch individually
            try {
                quotes = await Promise.all(
                    symbols.map(async (symbol) => {
                        try {
                            const result = await yahooFinance.quote(symbol);
                            return Array.isArray(result) ? result[0] : result;
                        } catch (err) {
                            console.error(`Failed to fetch quote for ${symbol}:`, err.message);
                            return null;
                        }
                    })
                );
                quotes = quotes.filter(q => q !== null);
            } catch (fallbackError) {
                console.error('All quote fetches failed:', fallbackError);
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
                    change3m: null
                };
            }
            
            const currentPrice = quote.regularMarketPrice || quote.price || quote.regularMarketPreviousClose || 0;
            const previousClose = quote.regularMarketPreviousClose || baselinePrice || currentPrice;
            
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
        
        res.status(200).json(results);
    } catch (error) {
        console.error('Error fetching current stocks:', error);
        res.status(500).json({ error: 'Failed to fetch stock data', details: error.message });
    }
};

