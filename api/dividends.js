// Per-manager 2026 dividend history: payments, total per share, and the
// percentage each adds to YTD total return (vs the Dec 31, 2025 baseline)
const { buildDividendSummary } = require('./utils');

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

    try {
        const summary = await buildDividendSummary();
        if (!summary || summary.length === 0) {
            return res.status(503).json({ error: 'Unable to fetch dividend data. Please try again later.' });
        }
        res.status(200).json(summary);
    } catch (error) {
        console.error('Error fetching dividends:', error);
        res.status(503).json({ error: 'Failed to fetch dividend data. Please try again later.' });
    }
};
