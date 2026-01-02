const yahooFinance = require('yahoo-finance2').default;
const { loadManagersFromConfig, getHistoricalPrice, generateMockChartData } = require('../utils');

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
        const useMock = req.query.mock === 'true';
        
        if (useMock) {
            const mockData = generateMockChartData();
            return res.status(200).json(mockData);
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
        
        res.status(200).json({
            months: monthLabels,
            data: stockData
        });
    } catch (error) {
        console.error('Error fetching monthly stocks:', error);
        res.status(500).json({ error: 'Failed to fetch monthly stock data', details: error.message });
    }
};

