// Background cache refresh cron job
// Runs every 15 minutes during market hours to keep cache fresh
// This prevents users from waiting for API calls

const { loadManagersFromConfig, getBaselinePrices, computeManagerResult, setCachedStockData, CACHE_KEYS, isMarketOpen } = require('../utils');
const YahooFinance = require('yahoo-finance2').default;
const yahooFinance = new YahooFinance();

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
            
            // Get baseline prices (Dec 31, 2025) - uses permanent cache
            const baselinePrices = await getBaselinePrices(symbols);
            
            const quoteMap = {};
            quotes.forEach(quote => {
                quoteMap[quote.symbol] = quote;
            });
            
            // Same computation as /api/stocks/current so cron-refreshed cache
            // includes dividends, 1m/3m changes, and analyses
            const results = await Promise.all(managers.map((manager, index) =>
                computeManagerResult(manager, quoteMap[manager.stockSymbol], baselinePrices[index])
            ));
            
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

