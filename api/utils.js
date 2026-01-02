// Shared utility functions for Vercel API routes
const path = require('path');
const fs = require('fs');
const yahooFinance = require('yahoo-finance2').default;

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

module.exports = {
    loadManagersFromConfig,
    getHistoricalPrice,
    generateMockChartData
};

