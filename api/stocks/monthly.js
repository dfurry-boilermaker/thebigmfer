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
        const cached = await getCachedData(CACHE_KEYS.MONTHLY);

        if (cached && cached.data && cached.data.length > 0) {
            if (await isStale(CACHE_KEYS.MONTHLY)) {
                triggerBackgroundRefresh();
            }
            return res.status(200).json(cached);
        }

        triggerBackgroundRefresh();
        return res.status(503).json({
            error: 'Chart data is loading. Please refresh in a moment.'
        });
    } catch (error) {
        console.error('Error in /api/stocks/monthly:', error.message);
        return res.status(503).json({ error: 'Service temporarily unavailable.' });
    }
};
