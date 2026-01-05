const YahooFinance = require('yahoo-finance2').default;
const yahooFinance = new YahooFinance();
const { getHistoricalPrice } = require('./utils');

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

