// Nasdaq Data Link API utility functions
const https = require('https');

const NASDAQ_API_KEY = process.env.NASDAQ_API_KEY || '';
const NASDAQ_BASE_URL = 'https://data.nasdaq.com/api/v3';

// Helper function to make API requests
function makeRequest(url) {
    return new Promise((resolve, reject) => {
        https.get(url, (res) => {
            let data = '';
            
            res.on('data', (chunk) => {
                data += chunk;
            });
            
            res.on('end', () => {
                try {
                    const json = JSON.parse(data);
                    if (res.statusCode === 200) {
                        resolve(json);
                    } else {
                        reject(new Error(`API error: ${res.statusCode} - ${json.error || data}`));
                    }
                } catch (error) {
                    reject(new Error(`Parse error: ${error.message}`));
                }
            });
        }).on('error', (error) => {
            reject(error);
        });
    });
}

// Get current quote for a symbol
// Note: Nasdaq Data Link uses WIKI dataset which may have limited coverage
// For better coverage, you might need to use EOD/{EXCHANGE}/{SYMBOL}
async function getCurrentQuote(symbol) {
    try {
        // Try WIKI dataset first (free, but limited coverage)
        const url = `${NASDAQ_BASE_URL}/datasets/WIKI/${symbol}/data.json?api_key=${NASDAQ_API_KEY}&limit=1&order=desc`;
        
        const response = await makeRequest(url);
        
        if (response.dataset_data && response.dataset_data.data && response.dataset_data.data.length > 0) {
            const latest = response.dataset_data.data[0];
            // Format: [date, open, high, low, close, volume, adjusted_close]
            const [date, open, high, low, close, volume, adjustedClose] = latest;
            
            return {
                symbol: symbol,
                date: new Date(date),
                open: open,
                high: high,
                low: low,
                close: close || adjustedClose,
                adjustedClose: adjustedClose || close,
                volume: volume,
                regularMarketPrice: close || adjustedClose,
                regularMarketPreviousClose: null // Will need to fetch previous day for this
            };
        }
        
        return null;
    } catch (error) {
        // If WIKI doesn't work, try EOD dataset (may require different format)
        console.log(`WIKI dataset failed for ${symbol}, trying alternatives:`, error.message);
        return null;
    }
}

// Get historical data for a symbol
async function getHistoricalData(symbol, startDate, endDate) {
    try {
        const startStr = startDate.toISOString().split('T')[0]; // YYYY-MM-DD
        const endStr = endDate.toISOString().split('T')[0]; // YYYY-MM-DD
        
        const url = `${NASDAQ_BASE_URL}/datasets/WIKI/${symbol}/data.json?api_key=${NASDAQ_API_KEY}&start_date=${startStr}&end_date=${endStr}&order=asc`;
        
        const response = await makeRequest(url);
        
        if (response.dataset_data && response.dataset_data.data) {
            return response.dataset_data.data.map(row => {
                // Format: [date, open, high, low, close, volume, adjusted_close]
                const [date, open, high, low, close, volume, adjustedClose] = row;
                return {
                    date: new Date(date),
                    open: open,
                    high: high,
                    low: low,
                    close: close || adjustedClose,
                    adjustedClose: adjustedClose || close,
                    volume: volume
                };
            });
        }
        
        return [];
    } catch (error) {
        console.error(`Error fetching historical data for ${symbol}:`, error.message);
        return [];
    }
}

// Get historical price for a specific date
async function getHistoricalPrice(symbol, targetDate) {
    try {
        const dateStr = targetDate.split('T')[0]; // Handle YYYY-MM-DD format
        const url = `${NASDAQ_BASE_URL}/datasets/WIKI/${symbol}/data.json?api_key=${NASDAQ_API_KEY}&start_date=${dateStr}&end_date=${dateStr}&limit=1&order=desc`;
        
        const response = await makeRequest(url);
        
        if (response.dataset_data && response.dataset_data.data && response.dataset_data.data.length > 0) {
            const row = response.dataset_data.data[0];
            // Format: [date, open, high, low, close, volume, adjusted_close]
            const close = row[4] || row[6]; // Use close or adjusted_close
            return close;
        }
        
        return null;
    } catch (error) {
        console.error(`Error fetching historical price for ${symbol} on ${targetDate}:`, error.message);
        return null;
    }
}

// Get intraday/hourly data (Note: Nasdaq Data Link may not support intraday, will need to check)
async function getIntradayData(symbol, startDate, endDate, interval = '1h') {
    // Nasdaq Data Link primarily provides daily data
    // For intraday data, you may need a different endpoint or service
    // This is a placeholder - you might need to use a different data source for intraday
    console.log(`Intraday data not directly available via Nasdaq Data Link for ${symbol}`);
    return [];
}

module.exports = {
    getCurrentQuote,
    getHistoricalData,
    getHistoricalPrice,
    getIntradayData
};

