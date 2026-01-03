// Background cache refresh cron job
// Runs every 15 minutes during market hours to keep cache fresh
// This prevents users from waiting for API calls

const { loadManagersFromConfig, getHistoricalPrice, getIntradayData, setCachedStockData, CACHE_KEYS, isMarketOpen, isDuringMarketHours } = require('../utils');
const yahooFinance = require('yahoo-finance2').default;

module.exports = async (req, res) => {
    // Vercel Cron jobs send a specific header
    // For security, you can check for the cron secret if set
    if (process.env.CRON_SECRET && req.headers['authorization'] !== `Bearer ${process.env.CRON_SECRET}`) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    
    try {
        // Only refresh during market hours
        if (!isMarketOpen()) {
            console.log('Market is closed, skipping cache refresh');
            return res.status(200).json({ message: 'Market closed, cache refresh skipped' });
        }
        
        console.log('Starting background cache refresh...');
        
        const managers = loadManagersFromConfig();
        const symbols = managers.map(m => m.stockSymbol);
        
        // Refresh current stock data
        try {
            let quotes = [];
            try {
                const result = await yahooFinance.quote(symbols);
                quotes = Array.isArray(result) ? result : [result];
            } catch (error) {
                console.log('Batch quote failed, fetching individually:', error.message);
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
            }
            
            const baselineDate = '2025-12-31';
            const baselinePromises = symbols.map(symbol => 
                getHistoricalPrice(symbol, baselineDate)
            );
            const baselinePrices = await Promise.all(baselinePromises);
            
            const quoteMap = {};
            quotes.forEach(quote => {
                quoteMap[quote.symbol] = quote;
            });
            
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
                
                const ytdChange = baselinePrice > 0 
                    ? ((currentPrice - baselinePrice) / baselinePrice) * 100 
                    : 0;
                
                let change1d = null;
                if (previousClose && previousClose > 0) {
                    change1d = ((currentPrice - previousClose) / previousClose) * 100;
                } else if (baselinePrice && baselinePrice > 0) {
                    change1d = ((currentPrice - baselinePrice) / baselinePrice) * 100;
                }
                
                const today = new Date();
                const yearStart = new Date(2026, 0, 1);
                const daysSinceStart = Math.floor((today - yearStart) / (1000 * 60 * 60 * 24));
                
                let change1m = null;
                let change3m = null;
                
                if (daysSinceStart >= 30) {
                    // Placeholder - could fetch historical data
                }
                
                if (daysSinceStart >= 90) {
                    // Placeholder - could fetch historical data
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
            
            results.sort((a, b) => {
                const aPercent = a.changePercent || -Infinity;
                const bPercent = b.changePercent || -Infinity;
                return bPercent - aPercent;
            });
            
            if (results.length > 0 && results.some(r => r.changePercent !== null && r.currentPrice > 0)) {
                await setCachedStockData(CACHE_KEYS.CURRENT, results, 900); // 15 minutes TTL
                console.log('Current stock data refreshed in cache');
            }
        } catch (error) {
            console.error('Error refreshing current stock data:', error.message);
        }
        
        // Refresh monthly chart data (less frequently - only if needed)
        // For now, we'll skip this in the cron job to reduce API calls
        // Monthly data is less time-sensitive and can be refreshed on-demand
        
        res.status(200).json({ 
            message: 'Cache refresh completed',
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        console.error('Error in cache refresh cron job:', error);
        res.status(500).json({ error: 'Cache refresh failed', details: error.message });
    }
};

