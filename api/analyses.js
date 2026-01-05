const { loadManagersFromConfig } = require('../utils');

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
        
        res.status(200).json({ analyses });
    } catch (error) {
        console.error('Error loading manager analyses:', error);
        // Return empty object if file doesn't exist or can't be read
        res.status(200).json({ analyses: {} });
    }
};

