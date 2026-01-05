const YahooFinance = require('yahoo-finance2').default;
const yahooFinance = new YahooFinance();
const { getBaselinePrices } = require('./utils');

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
        const indexes = [
            { symbol: 'SPY', name: 'S&P 500' },
            { symbol: 'QQQ', name: 'Nasdaq 100' },
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
        res.status(200).json(results);
    } catch (error) {
        console.error('Error fetching indexes:', error);
        console.error(error.stack);
        // Return empty results instead of error to allow frontend to show mock data
        res.status(200).json([
            { symbol: 'SPY', name: 'S&P 500', currentPrice: null, changePercent: null, change1d: null },
            { symbol: 'QQQ', name: 'Nasdaq 100', currentPrice: null, changePercent: null, change1d: null },
            { symbol: 'DX-Y.NYB', name: 'US Dollar', currentPrice: null, changePercent: null, change1d: null }
        ]);
    }
};

