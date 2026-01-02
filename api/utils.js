// Shared utility functions for Vercel API routes
const path = require('path');
const fs = require('fs');
const yahooFinance = require('yahoo-finance2').default;

// Cache for stock data when market is closed
let stockDataCache = {
    current: null,
    monthly: null,
    lastUpdate: null,
    marketWasOpen: false
};

// Check if US stock market is currently open
function isMarketOpen() {
    const now = new Date();
    
    // Get Eastern Time (handles DST automatically)
    const etString = now.toLocaleString('en-US', { timeZone: 'America/New_York' });
    const et = new Date(etString);
    
    const day = et.getDay(); // 0 = Sunday, 6 = Saturday
    const hour = et.getHours();
    const minute = et.getMinutes();
    const time = hour * 60 + minute; // Time in minutes since midnight
    
    // Market is closed on weekends
    if (day === 0 || day === 6) {
        return false;
    }
    
    // Market hours: 9:30 AM - 4:00 PM ET
    const marketOpen = 9 * 60 + 30; // 9:30 AM
    const marketClose = 16 * 60; // 4:00 PM
    
    const isOpen = time >= marketOpen && time < marketClose;
    
    if (!isOpen) {
        console.log(`Market is closed. Current ET time: ${hour}:${minute.toString().padStart(2, '0')}, Day: ${day}`);
    }
    
    return isOpen;
}

// Check if we should use cached data
function shouldUseCache() {
    // Always fetch fresh data during market hours
    if (isMarketOpen()) {
        return false;
    }
    
    // Use cache if:
    // 1. Market is closed AND
    // 2. We have cached data AND
    // 3. Cache was created when market was closed (not stale pre-market data)
    if (stockDataCache.current && stockDataCache.lastUpdate) {
        const cacheAge = Date.now() - stockDataCache.lastUpdate;
        const maxCacheAge = 24 * 60 * 60 * 1000; // 24 hours
        
        // Use cache if it's less than 24 hours old
        if (cacheAge < maxCacheAge) {
            return true;
        }
    }
    
    return false;
}

// Load managers from JSON file
function loadManagersFromConfig() {
    try {
        // In Vercel, __dirname points to the api directory, so go up one level
        const configPath = path.join(process.cwd(), 'managers.json');
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
    
    // Mock data goes up to July 17, 2026
    const mockEndMonth = 6; // July (0-indexed)
    const mockEndDay = 17;
    
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const monthLabels = [];
    for (let i = 0; i <= mockEndMonth; i++) {
        monthLabels.push(months[i]);
    }
    
    // Define unique performance patterns for each stock
    // Each pattern represents month-end values for Jan-Jun, then daily values for July
    const stockPatterns = [
        // Daniel - NBIS: Strong start, then moderate growth
        { jan: 8.5, feb: 12.3, mar: 10.8, apr: 14.2, may: 18.6, jun: 16.4, july: [17.1, 17.8, 18.2, 18.9, 19.5, 19.1, 18.7, 19.0, 18.4, 19.2, 18.9, 18.6] },
        // Sam - NVDA: Volatile tech stock with big swings
        { jan: 15.2, feb: 22.1, mar: 18.5, apr: 25.3, may: 28.7, jun: 24.9, july: [25.6, 26.2, 25.1, 27.3, 28.1, 27.5, 26.8, 27.2, 26.4, 27.8, 27.1, 26.7] },
        // Szklarek - WY: Steady consistent growth
        { jan: 5.2, feb: 8.1, mar: 9.5, apr: 11.8, may: 13.4, jun: 12.6, july: [13.1, 13.5, 13.8, 14.2, 14.6, 14.3, 14.0, 14.4, 14.1, 14.7, 14.4, 14.2] },
        // Cale - NVO: Strong upward trend
        { jan: 12.8, feb: 16.4, mar: 19.2, apr: 22.6, may: 26.3, jun: 24.8, july: [25.4, 26.1, 26.7, 27.3, 28.0, 27.6, 27.2, 27.5, 27.0, 27.8, 27.4, 27.1] },
        // Charlie - TSLA: High volatility, big moves
        { jan: -3.2, feb: 2.5, mar: -1.8, apr: 5.2, may: 9.8, jun: 7.4, july: [8.1, 8.9, 8.3, 9.5, 10.2, 9.7, 9.2, 9.6, 9.0, 10.1, 9.5, 9.2] },
        // Kruse - AMTM: Slow and steady
        { jan: 3.1, feb: 5.8, mar: 7.2, apr: 8.9, may: 10.5, jun: 9.8, july: [10.2, 10.6, 10.9, 11.3, 11.7, 11.4, 11.1, 11.5, 11.2, 11.8, 11.5, 11.3] },
        // Kyle - PLTR: Tech growth with corrections
        { jan: 18.5, feb: 24.2, mar: 20.8, apr: 27.1, may: 31.5, jun: 28.3, july: [29.1, 29.8, 29.2, 30.4, 31.2, 30.6, 30.1, 30.5, 29.9, 31.1, 30.4, 30.0] },
        // Adam - JPM: Financial sector, moderate growth
        { jan: 6.8, feb: 9.5, mar: 11.2, apr: 13.8, may: 16.4, jun: 15.1, july: [15.7, 16.2, 16.6, 17.1, 17.6, 17.3, 17.0, 17.4, 16.9, 17.7, 17.3, 17.0] },
        // Carson - AMZN: E-commerce giant, steady climb
        { jan: 9.2, feb: 13.1, mar: 15.8, apr: 18.4, may: 21.7, jun: 20.2, july: [20.9, 21.5, 22.0, 22.6, 23.2, 22.8, 22.4, 22.7, 22.2, 23.0, 22.5, 22.2] },
        // Grant - WM: Waste management, stable
        { jan: 4.5, feb: 7.2, mar: 8.6, apr: 10.3, may: 12.1, jun: 11.4, july: [11.9, 12.3, 12.6, 13.0, 13.4, 13.1, 12.8, 13.2, 12.9, 13.5, 13.2, 13.0] },
        // Nick - PM: Tobacco, defensive play
        { jan: 2.8, feb: 5.1, mar: 6.4, apr: 7.9, may: 9.3, jun: 8.7, july: [9.1, 9.5, 9.8, 10.2, 10.6, 10.3, 10.0, 10.4, 10.1, 10.7, 10.4, 10.2] },
        // Pierino - CRCL: Circular economy, growth potential
        { jan: 11.5, feb: 14.8, mar: 13.2, apr: 16.5, may: 19.2, jun: 17.8, july: [18.4, 19.1, 18.7, 19.8, 20.5, 20.1, 19.6, 20.0, 19.4, 20.6, 20.2, 19.9] }
    ];
    
    // Generate mock performance data for each stock
    const stockData = managers.map((manager, index) => {
        const symbol = manager.stockSymbol;
        const pattern = stockPatterns[index] || stockPatterns[0]; // Fallback to first pattern
        const data = [0]; // Start at 0% (baseline Dec 31, 2025)
        
        // Add month-end values for Jan-Jun
        data.push(pattern.jan);
        data.push(pattern.feb);
        data.push(pattern.mar);
        data.push(pattern.apr);
        data.push(pattern.may);
        data.push(pattern.jun);
        
        // Add daily data for July (up to July 17 = 12 trading days)
        data.push(...pattern.july);
        
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

module.exports = {
    loadManagersFromConfig,
    getHistoricalPrice,
    generateMockChartData,
    isMarketOpen,
    shouldUseCache,
    stockDataCache
};

