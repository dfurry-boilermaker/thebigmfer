const {
    CACHE_KEYS,
    getCachedData,
    isStale,
    triggerBackgroundRefresh
} = require('../utils');

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

    try {
        const cached = await getCachedData(CACHE_KEYS.CURRENT);

        if (cached && Array.isArray(cached) && cached.length > 0) {
            // Serve cached data immediately
            if (await isStale(CACHE_KEYS.CURRENT)) {
                triggerBackgroundRefresh();
            }
            return res.status(200).json(cached);
        }

        // No cached data — trigger refresh and return 503
        triggerBackgroundRefresh();
        return res.status(503).json({
            error: 'Data is loading. Please refresh in a moment.'
        });
    } catch (error) {
        console.error('Error in /api/stocks/current:', error.message);
        return res.status(503).json({ error: 'Service temporarily unavailable.' });
    }
};
