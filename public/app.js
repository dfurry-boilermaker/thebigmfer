const API_BASE = '/api';

// DOM Elements
const leaderboard = document.getElementById('leaderboard');
const indexes = document.getElementById('indexes');
let performanceChart = null;
let managerAnalyses = {}; // Cache for manager analyses

// Theme Management
function initTheme() {
    const savedTheme = localStorage.getItem('theme') || 'light';
    document.documentElement.setAttribute('data-theme', savedTheme);
    updateThemeIcon(savedTheme);
}

function toggleTheme() {
    const currentTheme = document.documentElement.getAttribute('data-theme') || 'light';
    const newTheme = currentTheme === 'light' ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', newTheme);
    localStorage.setItem('theme', newTheme);
    updateThemeIcon(newTheme);
    
    // Re-render chart with new theme colors if chart exists
    if (performanceChart && window.lastChartData && window.lastLeaderboardData) {
        renderChart(window.lastChartData, window.lastLeaderboardData);
        renderZoomedChart(window.lastChartData, window.lastLeaderboardData);
        renderBumpChart(window.lastChartData, window.lastLeaderboardData);
        renderStats(window.lastChartData, window.lastLeaderboardData);
    }
}

function updateThemeIcon(theme) {
    // Icon updates are handled by CSS based on data-theme attribute
    // No JavaScript needed for icon updates
}

// Initialize theme on page load
document.addEventListener('DOMContentLoaded', () => {
    initTheme();
    const themeToggle = document.getElementById('themeToggle');
    if (themeToggle) {
        themeToggle.addEventListener('click', toggleTheme);
    }
});

// Load Leaderboard
// LocalStorage cache keys
const CACHE_KEYS = {
    leaderboard: 'stock_competition_leaderboard',
    chart: 'stock_competition_chart',
    leaderboardTimestamp: 'stock_competition_leaderboard_timestamp',
    chartTimestamp: 'stock_competition_chart_timestamp'
};

// Cache duration: 15 minutes (same as refresh interval)
const CACHE_DURATION = 15 * 60 * 1000; // 15 minutes in milliseconds

// Check if cached data is still valid
function isCacheValid(timestamp) {
    if (!timestamp) return false;
    const cacheAge = Date.now() - timestamp;
    return cacheAge < CACHE_DURATION;
}

// Get cached data from localStorage
function getCachedData(key, timestampKey) {
    try {
        const cached = localStorage.getItem(key);
        const timestamp = localStorage.getItem(timestampKey);
        
        if (cached && timestamp && isCacheValid(parseInt(timestamp))) {
            return JSON.parse(cached);
        }
    } catch (error) {
        console.error('Error reading from cache:', error);
    }
    return null;
}

// Store data in localStorage
function setCachedData(key, timestampKey, data) {
    try {
        localStorage.setItem(key, JSON.stringify(data));
        localStorage.setItem(timestampKey, Date.now().toString());
    } catch (error) {
        console.error('Error writing to cache:', error);
    }
}

async function loadLeaderboard() {
    try {
        // Check cache first
        const cachedData = getCachedData(CACHE_KEYS.leaderboard, CACHE_KEYS.leaderboardTimestamp);
        if (cachedData) {
            console.log('Using cached leaderboard data');
            // Extract analyses from cached data
            managerAnalyses = extractAnalysesFromLeaderboardData(cachedData);
            renderLeaderboard(cachedData);
            
            // Fetch fresh data in background (don't wait for it)
            fetchLeaderboardInBackground();
            return;
        }
        
        // No valid cache, fetch from API
        await fetchLeaderboardData();
    } catch (error) {
        console.error('Error loading leaderboard:', error);
        
        // Try to use cached data even if expired
        const cachedData = getCachedData(CACHE_KEYS.leaderboard, CACHE_KEYS.leaderboardTimestamp);
        if (cachedData) {
            console.log('Using expired cached data due to error');
            managerAnalyses = extractAnalysesFromLeaderboardData(cachedData);
            renderLeaderboard(cachedData);
            return;
        }
        
        leaderboard.innerHTML = `<div class="error-message">Failed to load data. Please try again later.</div>`;
    }
}

// Fetch manager analyses
// Extract analyses from leaderboard data (analyses are now included in the API response)
function extractAnalysesFromLeaderboardData(data) {
    if (!data || !Array.isArray(data)) {
        console.warn('extractAnalysesFromLeaderboardData: Invalid data', data);
        return {};
    }
    
    const analyses = {};
    data.forEach(item => {
        if (item && item.name) {
            // Check if analysis exists and is not the placeholder text
            if (item.analysis &&
                typeof item.analysis === 'string' &&
                item.analysis.trim() !== '' &&
                !isPlaceholderAnalysis(item.analysis)) {
                analyses[item.name] = {
                    stockSymbol: item.symbol,
                    analysis: item.analysis
                };
            }
        }
    });
    
    console.log('Extracted analyses from leaderboard data:', Object.keys(analyses).length, 'analyses');
    console.log('Analyses extracted:', analyses);
    return analyses;
}

async function fetchLeaderboardData() {
    const url = `${API_BASE}/stocks/current`;
    console.log('Fetching leaderboard from API:', url);
    const response = await fetch(url);
    
    if (!response.ok) {
        const errorText = await response.text();
        console.error('Leaderboard API error:', response.status, errorText);
        // If it's a 503, the API couldn't get data - show error message
        if (response.status === 503) {
            try {
                const errorData = JSON.parse(errorText);
                throw new Error(errorData.error || 'Service temporarily unavailable');
            } catch (e) {
                throw new Error('Service temporarily unavailable. Please try again later.');
            }
        }
        throw new Error(`API error: ${response.status}`);
    }
    
    const data = await response.json();
    
    // Validate that we have actual data, not just null values
    if (!data || !Array.isArray(data) || data.length === 0 || !data.some(item => item.changePercent !== null && item.currentPrice > 0)) {
        throw new Error('No valid stock data available');
    }
    console.log('Leaderboard data received:', data.length, 'items');
    
    // Extract analyses from the API response (analyses are now included in the response)
    managerAnalyses = extractAnalysesFromLeaderboardData(data);
    console.log('Manager analyses extracted:', Object.keys(managerAnalyses).length, 'analyses');
    
    // Store data for theme switching
    window.lastLeaderboardData = data;
    
    // Cache the data
    setCachedData(CACHE_KEYS.leaderboard, CACHE_KEYS.leaderboardTimestamp, data);
    
    // Render the data
    renderLeaderboard(data);
}

async function fetchLeaderboardInBackground() {
    // Silently fetch fresh data in background
    try {
        const url = `${API_BASE}/stocks/current`;
        const response = await fetch(url);
        if (response.ok) {
            const data = await response.json();
            setCachedData(CACHE_KEYS.leaderboard, CACHE_KEYS.leaderboardTimestamp, data);
            
            // Update leaderboard display with fresh data
            managerAnalyses = extractAnalysesFromLeaderboardData(data);
            window.lastLeaderboardData = data;
            renderLeaderboard(data);
            
            console.log('Background refresh: leaderboard data updated');
        }
    } catch (error) {
        console.log('Background refresh failed (non-critical):', error.message);
    }
}

function getBenchmarkYtd(symbol = 'SPY') {
    const indexCache = localStorage.getItem('stock_competition_indexes');
    if (!indexCache) return null;

    try {
        const indexes = JSON.parse(indexCache);
        const benchmark = indexes.find(index => index.symbol === symbol);
        return benchmark ? benchmark.changePercent : null;
    } catch (error) {
        return null;
    }
}

function renderLeaderboard(data) {
    if (!data || data.length === 0) {
        console.warn('No data to render');
        leaderboard.innerHTML = `
            <div class="empty-state">
                <p>No managers found.</p>
            </div>
        `;
        return;
    }
    
    console.log('Rendering leaderboard with', data.length, 'items');
    console.log('Manager analyses available:', Object.keys(managerAnalyses).length);

    const validYtdValues = data
        .filter(item => item.changePercent !== null && item.changePercent !== undefined)
        .map(item => item.changePercent);
    const fieldAverage = validYtdValues.length > 0
        ? validYtdValues.reduce((a, b) => a + b, 0) / validYtdValues.length
        : null;
    const spyYtd = getBenchmarkYtd('SPY');
    
    leaderboard.innerHTML = data.map((item, index) => {
        const rank = index + 1;
        const rankClass = rank === 1 ? 'first' : rank === 2 ? 'second' : rank === 3 ? 'third' : '';
        
        const change1dClass = item.change1d !== null ? (item.change1d >= 0 ? 'positive' : 'negative') : '';
        const change1wClass = item.change1w !== null && item.change1w !== undefined ? (item.change1w >= 0 ? 'positive' : 'negative') : '';
        const change1mClass = item.change1m !== null ? (item.change1m >= 0 ? 'positive' : 'negative') : '';
        const change3mClass = item.change3m !== null ? (item.change3m >= 0 ? 'positive' : 'negative') : '';
        const changeYTDClass = item.changePercent !== null ? (item.changePercent >= 0 ? 'positive' : 'negative') : '';
        const vsAvg = fieldAverage !== null && item.changePercent !== null ? item.changePercent - fieldAverage : null;
        const vsAvgClass = vsAvg !== null ? (vsAvg >= 0 ? 'positive' : 'negative') : 'no-data';
        const vsSpy = spyYtd !== null && item.changePercent !== null ? item.changePercent - spyYtd : null;
        const vsSpyClass = vsSpy !== null ? (vsSpy >= 0 ? 'positive' : 'negative') : 'no-data';

        // Get analysis for this manager
        // First check if analysis is directly on the item (from API), otherwise check managerAnalyses
        let rawAnalysis = null;
        if (item.analysis && typeof item.analysis === 'string' && item.analysis.trim() !== '') {
            rawAnalysis = item.analysis;
        } else if (managerAnalyses[item.name]) {
            rawAnalysis = managerAnalyses[item.name].analysis;
        }

        // Placeholder rows stay expandable but show a graceful note instead of scaffold text
        const hasAnalysis = !!rawAnalysis;
        const isPlaceholder = isPlaceholderAnalysis(rawAnalysis);
        const analysisBody = isPlaceholder ? 'Analysis coming soon.' : rawAnalysis;

        // Rank change vs one week ago (from chart history)
        let rankDeltaHtml = '';
        const previousRank = dramaContext && dramaContext.ranksWeekAgo
            ? dramaContext.ranksWeekAgo[item.symbol]
            : undefined;
        if (previousRank !== undefined) {
            const delta = previousRank - rank;
            if (delta > 0) {
                rankDeltaHtml = `<span class="rank-delta up" aria-label="Up ${delta} place${delta === 1 ? '' : 's'} since last week">&#9650;${delta}</span>`;
            } else if (delta < 0) {
                rankDeltaHtml = `<span class="rank-delta down" aria-label="Down ${-delta} place${delta === -1 ? '' : 's'} since last week">&#9660;${-delta}</span>`;
            }
        }

        // Leader shows days in lead; everyone else shows the gap to the rank above
        let raceNoteHtml = '';
        if (index === 0) {
            const leadDays = dramaContext && dramaContext.daysInLead
                ? dramaContext.daysInLead[item.symbol]
                : null;
            if (leadDays) {
                raceNoteHtml = `<span class="race-note lead">${leadDays} day${leadDays === 1 ? '' : 's'} in lead</span>`;
            }
        } else if (item.changePercent !== null && data[index - 1].changePercent !== null) {
            const gap = data[index - 1].changePercent - item.changePercent;
            raceNoteHtml = `<span class="race-note">${gap.toFixed(1)} behind #${rank - 1}</span>`;
        }

        const itemId = `leaderboard-item-${index}`;
        const analysisId = `analysis-${index}`;
        const interactiveAttrs = hasAnalysis
            ? `data-analysis-id="${analysisId}" role="button" tabindex="0" aria-expanded="false" aria-controls="${analysisId}"`
            : '';

        return `
            <div class="leaderboard-item ${rankClass} ${hasAnalysis ? 'clickable' : ''}" id="${itemId}" data-manager-name="${escapeHtml(item.name)}" ${interactiveAttrs}>
                <div class="rank">${rank}</div>
                <div class="manager-info">
                    <span class="manager-name">${escapeHtml(item.name)}</span>
                    <span class="stock-symbol">${escapeHtml(item.symbol)}</span>
                    <span class="current-price">$${formatPrice(item.currentPrice)}</span>
                    ${rankDeltaHtml}
                    ${raceNoteHtml}
                    <div class="time-periods mobile-only">
                        <span class="time-period">
                            <span class="period-label">1d</span>
                            <span class="period-value ${item.change1d === null ? 'no-data' : change1dClass}">${item.change1d !== null ? getChangeSign(item.change1d) + formatPercent(item.change1d) + '%' : '-'}</span>
                        </span>
                        <span class="time-period">
                            <span class="period-label">1w</span>
                            <span class="period-value ${item.change1w === null || item.change1w === undefined ? 'no-data' : change1wClass}">${item.change1w !== null && item.change1w !== undefined ? getChangeSign(item.change1w) + formatPercent(item.change1w) + '%' : '-'}</span>
                        </span>
                        <span class="time-period">
                            <span class="period-label">1m</span>
                            <span class="period-value ${item.change1m === null ? 'no-data' : change1mClass}">${item.change1m !== null ? getChangeSign(item.change1m) + formatPercent(item.change1m) + '%' : '-'}</span>
                        </span>
                        <span class="time-period">
                            <span class="period-label">3m</span>
                            <span class="period-value ${item.change3m === null ? 'no-data' : change3mClass}">${item.change3m !== null ? getChangeSign(item.change3m) + formatPercent(item.change3m) + '%' : '-'}</span>
                        </span>
                        <span class="time-period">
                            <span class="period-label">YTD</span>
                            <span class="period-value ${item.changePercent === null ? 'no-data' : changeYTDClass}">${item.changePercent !== null ? getChangeSign(item.changePercent) + formatPercent(item.changePercent) + '%' : '-'}</span>
                        </span>
                    </div>
                </div>
                <div class="price-percent-combined">
                    <div class="leaderboard-context-metrics">
                        <span class="leaderboard-context-metric">
                            <span class="context-label">vs Avg</span>
                            <span class="context-value ${vsAvgClass}">${vsAvg !== null ? formatSignedPercentValue(vsAvg) : '-'}</span>
                        </span>
                        <span class="leaderboard-context-metric">
                            <span class="context-label">vs SPY</span>
                            <span class="context-value ${vsSpyClass}">${vsSpy !== null ? formatSignedPercentValue(vsSpy) : '-'}</span>
                        </span>
                    </div>
                    <div class="time-periods desktop-only">
                        <span class="time-period">
                            <span class="period-label">1d</span>
                            <span class="period-value ${item.change1d === null ? 'no-data' : change1dClass}">${item.change1d !== null ? getChangeSign(item.change1d) + formatPercent(item.change1d) + '%' : '-'}</span>
                        </span>
                        <span class="time-period">
                            <span class="period-label">1w</span>
                            <span class="period-value ${item.change1w === null || item.change1w === undefined ? 'no-data' : change1wClass}">${item.change1w !== null && item.change1w !== undefined ? getChangeSign(item.change1w) + formatPercent(item.change1w) + '%' : '-'}</span>
                        </span>
                        <span class="time-period">
                            <span class="period-label">1m</span>
                            <span class="period-value ${item.change1m === null ? 'no-data' : change1mClass}">${item.change1m !== null ? getChangeSign(item.change1m) + formatPercent(item.change1m) + '%' : '-'}</span>
                        </span>
                        <span class="time-period">
                            <span class="period-label">3m</span>
                            <span class="period-value ${item.change3m === null ? 'no-data' : change3mClass}">${item.change3m !== null ? getChangeSign(item.change3m) + formatPercent(item.change3m) + '%' : '-'}</span>
                        </span>
                        <span class="time-period">
                            <span class="period-label">YTD</span>
                            <span class="period-value ${item.changePercent === null ? 'no-data' : changeYTDClass}">${item.changePercent !== null ? getChangeSign(item.changePercent) + formatPercent(item.changePercent) + '%' : '-'}</span>
                        </span>
                    </div>
                </div>
                ${hasAnalysis ? `
                    <div class="analysis-content" id="${analysisId}">
                        <div class="analysis-text ${isPlaceholder ? 'placeholder' : ''}">${escapeHtml(analysisBody)}</div>
                    </div>
                ` : ''}
            </div>
        `;
    }).join('');

    // Re-apply the #manager/Name route after innerHTML rebuilds; only scroll once
    if (applyHashRoute(!hashScrollDone)) {
        hashScrollDone = true;
    }
}

// Toggle analysis dropdown (global for onclick handler)
window.toggleAnalysis = function(analysisId) {
    try {
        const analysisContent = document.getElementById(analysisId);
        if (!analysisContent) {
            console.error('Analysis content not found:', analysisId);
            return;
        }
        
        const leaderboardItem = analysisContent.closest('.leaderboard-item');
        const managerName = leaderboardItem ? leaderboardItem.getAttribute('data-manager-name') : null;

        if (analysisContent.classList.contains('expanded')) {
            analysisContent.classList.remove('expanded');
            if (leaderboardItem) {
                leaderboardItem.setAttribute('aria-expanded', 'false');
            }
            // Clear the deep-link hash only if it points at this manager
            if (managerName && location.hash === '#manager/' + encodeURIComponent(managerName)) {
                history.replaceState(null, '', location.pathname + location.search);
            }
        } else {
            analysisContent.classList.add('expanded');
            if (leaderboardItem) {
                leaderboardItem.setAttribute('aria-expanded', 'true');
            }
            // Update the shareable deep link without scrolling or adding history entries
            if (managerName) {
                history.replaceState(null, '', '#manager/' + encodeURIComponent(managerName));
                hashScrollDone = true;
            }
        }
    } catch (error) {
        console.error('Error toggling analysis:', error);
    }
}

// Use event delegation for clickable leaderboard items
document.addEventListener('click', function(event) {
    const leaderboardItem = event.target.closest('.leaderboard-item.clickable');
    if (leaderboardItem) {
        const analysisId = leaderboardItem.getAttribute('data-analysis-id');
        if (analysisId) {
            event.preventDefault();
            event.stopPropagation();
            window.toggleAnalysis(analysisId);
        }
    }
});

// Keyboard support: Enter/Space toggles a focused leaderboard row
document.addEventListener('keydown', function(event) {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    const leaderboardItem = event.target.closest('.leaderboard-item.clickable');
    if (leaderboardItem) {
        const analysisId = leaderboardItem.getAttribute('data-analysis-id');
        if (analysisId) {
            event.preventDefault();
            window.toggleAnalysis(analysisId);
        }
    }
});


function getChangeSign(value) {
    return value >= 0 ? '+' : '';
}

// Utility Functions
function formatPrice(price) {
    if (price === null || price === undefined) return 'N/A';
    return Number(price).toFixed(2);
}

function formatPercent(percent) {
    if (percent === null || percent === undefined) return '0.00';
    const abs = Math.abs(Number(percent));
    if (abs >= 100) return abs.toFixed(0);
    if (abs >= 10) return abs.toFixed(1);
    return abs.toFixed(2);
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Detect the scaffold text from managers.json.example so it never renders as a real thesis
function isPlaceholderAnalysis(text) {
    return typeof text === 'string' && /^your analysis here/i.test(text.trim());
}

function prefersReducedMotion() {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

// Competition drama context (rank changes, weekly moves, days in lead) derived
// from the historical chart series — no extra API calls needed
let dramaContext = null;

function computeDramaContext(chartData, currentData) {
    if (!chartData || !Array.isArray(chartData.data) || chartData.data.length === 0 ||
        !currentData || !Array.isArray(currentData) || currentData.length === 0) {
        return null;
    }

    const weekAgoTs = Date.now() - 7 * 24 * 60 * 60 * 1000;

    const ytdNow = {};
    const nameBySymbol = {};
    currentData.forEach(stock => {
        nameBySymbol[stock.symbol] = stock.name;
        if (stock.changePercent !== null && stock.changePercent !== undefined) {
            ytdNow[stock.symbol] = stock.changePercent;
        }
    });

    // YTD value as of ~1 week ago: last historical point at or before that moment
    const ytdWeekAgo = {};
    chartData.data.forEach(stock => {
        if (!Array.isArray(stock.timestamps) || !Array.isArray(stock.data)) return;
        let value;
        for (let i = 0; i < stock.timestamps.length; i++) {
            if (stock.timestamps[i] <= weekAgoTs) value = stock.data[i];
            else break;
        }
        if (value !== undefined && ytdNow[stock.symbol] !== undefined) {
            ytdWeekAgo[stock.symbol] = value;
        }
    });

    const rankBy = values => Object.keys(values)
        .sort((a, b) => values[b] - values[a])
        .reduce((ranks, symbol, index) => { ranks[symbol] = index + 1; return ranks; }, {});

    const ranksNow = rankBy(ytdNow);
    const ranksWeekAgo = Object.keys(ytdWeekAgo).length >= 2 ? rankBy(ytdWeekAgo) : {};

    // True 1-week return, NOT the difference in YTD percentage points
    // (for a stock up 200% YTD, those two numbers diverge wildly)
    const weeklyMove = {};
    currentData.forEach(stock => {
        if (typeof stock.change1w === 'number') {
            weeklyMove[stock.symbol] = stock.change1w;
        } else if (ytdNow[stock.symbol] !== undefined && ytdWeekAgo[stock.symbol] !== undefined) {
            // Fallback for cached data without change1w: derive from YTD levels
            weeklyMove[stock.symbol] = ((100 + ytdNow[stock.symbol]) / (100 + ytdWeekAgo[stock.symbol]) - 1) * 100;
        }
    });

    let biggestMover = null;
    Object.keys(weeklyMove).forEach(symbol => {
        if (!biggestMover || Math.abs(weeklyMove[symbol]) > Math.abs(biggestMover.move)) {
            biggestMover = { symbol, name: nameBySymbol[symbol], move: weeklyMove[symbol] };
        }
    });

    let biggestComeback = null;
    Object.keys(ranksNow).forEach(symbol => {
        const previousRank = ranksWeekAgo[symbol];
        if (previousRank === undefined) return;
        const climbed = previousRank - ranksNow[symbol];
        if (climbed > 0 && (!biggestComeback || climbed > biggestComeback.rankDelta)) {
            biggestComeback = { symbol, name: nameBySymbol[symbol], rankDelta: climbed };
        }
    });

    // Days in lead: bucket each series to its last value per trading day,
    // then credit that day's leader
    const dailyValues = {};
    chartData.data.forEach(stock => {
        if (!Array.isArray(stock.timestamps) || !Array.isArray(stock.data)) return;
        stock.timestamps.forEach((ts, i) => {
            const dayKey = new Date(ts).toISOString().split('T')[0];
            if (!dailyValues[dayKey]) dailyValues[dayKey] = {};
            dailyValues[dayKey][stock.symbol] = stock.data[i];
        });
    });
    const daysInLead = {};
    Object.values(dailyValues).forEach(values => {
        const symbols = Object.keys(values);
        if (symbols.length < 2) return;
        const dayLeader = symbols.reduce((best, s) => values[s] > values[best] ? s : best, symbols[0]);
        daysInLead[dayLeader] = (daysInLead[dayLeader] || 0) + 1;
    });

    return { ranksNow, ranksWeekAgo, weeklyMove, daysInLead, biggestMover, biggestComeback, nameBySymbol };
}

function updateDramaContext(chartData, currentData) {
    dramaContext = computeDramaContext(chartData, currentData);
    renderWeeklyRecap(dramaContext, currentData);
}

// Weekly recap shown under the header: always three short insights
function renderWeeklyRecap(context, currentData) {
    const recap = document.getElementById('weeklyRecap');
    if (!recap) return;

    if (!context || !currentData || !Array.isArray(currentData)) {
        recap.hidden = true;
        return;
    }

    const insights = [];
    const sorted = [...currentData]
        .filter(s => s.changePercent !== null && s.changePercent !== undefined)
        .sort((a, b) => b.changePercent - a.changePercent);

    // 1. Biggest mover of the week
    if (context.biggestMover) {
        const mover = context.biggestMover;
        const verb = mover.move >= 0 ? 'gained' : 'dropped';
        insights.push(`${mover.symbol} (${mover.name}) ${verb} ${Math.abs(mover.move).toFixed(1)}% this week`);
    }

    // 2. Top-3 takeover, falling back to the biggest comeback anywhere in the field
    let rankInsight = null;
    for (let rank = 1; rank <= Math.min(3, sorted.length); rank++) {
        const stock = sorted[rank - 1];
        const previousRank = context.ranksWeekAgo[stock.symbol];
        if (previousRank !== undefined && previousRank > rank) {
            const displaced = Object.keys(context.ranksWeekAgo)
                .find(s => context.ranksWeekAgo[s] === rank && context.ranksNow[s] > rank);
            const displacedName = displaced ? context.nameBySymbol[displaced] : null;
            rankInsight = displacedName
                ? `${stock.name} takes #${rank} from ${displacedName}`
                : `${stock.name} climbs to #${rank}`;
            break;
        }
    }
    if (!rankInsight && context.biggestComeback) {
        const comeback = context.biggestComeback;
        const newRank = context.ranksNow[comeback.symbol];
        rankInsight = `${comeback.name} climbed ${comeback.rankDelta} spot${comeback.rankDelta === 1 ? '' : 's'} to #${newRank}`;
    }
    if (rankInsight) insights.push(rankInsight);

    // 3. Leader's grip on first place
    if (sorted.length > 0) {
        const leader = sorted[0];
        const leadDays = context.daysInLead ? context.daysInLead[leader.symbol] : null;
        const totalDays = context.daysInLead
            ? Object.values(context.daysInLead).reduce((a, b) => a + b, 0)
            : 0;
        if (leadDays && totalDays > 0) {
            insights.push(`${leader.name} (${leader.symbol}) has led ${leadDays} of ${totalDays} trading days`);
        } else {
            insights.push(`${leader.name} (${leader.symbol}) just took the overall lead`);
        }
    }

    // 4. Fallback: tightest battle between adjacent ranks
    if (insights.length < 3 && sorted.length >= 2) {
        let tightest = null;
        for (let i = 1; i < sorted.length; i++) {
            const gap = sorted[i - 1].changePercent - sorted[i].changePercent;
            if (!tightest || gap < tightest.gap) {
                tightest = { gap, upper: i, lower: i + 1 };
            }
        }
        if (tightest) {
            insights.push(`Just ${tightest.gap.toFixed(1)} pts separate #${tightest.upper} and #${tightest.lower}`);
        }
    }

    if (insights.length === 0) {
        recap.hidden = true;
        return;
    }

    const items = insights.slice(0, 3)
        .map(text => `<span class="weekly-recap-item">${escapeHtml(text)}.</span>`)
        .join('');
    recap.innerHTML = `<span class="weekly-recap-label">This Week</span><span class="weekly-recap-text">${items}</span>`;
    recap.hidden = false;
}

// Deep links: #manager/Name expands and scrolls to that manager's row
let hashScrollDone = false;

function applyHashRoute(allowScroll) {
    const match = location.hash.match(/^#manager\/(.+)$/);
    if (!match) return false;

    let name;
    try {
        name = decodeURIComponent(match[1]);
    } catch (e) {
        return false;
    }

    const row = Array.from(document.querySelectorAll('.leaderboard-item[data-manager-name]'))
        .find(el => el.getAttribute('data-manager-name').toLowerCase() === name.toLowerCase());
    if (!row) return false;

    const analysisId = row.getAttribute('data-analysis-id');
    const analysisContent = analysisId ? document.getElementById(analysisId) : null;
    if (analysisContent && !analysisContent.classList.contains('expanded')) {
        analysisContent.classList.add('expanded');
        row.setAttribute('aria-expanded', 'true');
    }

    if (allowScroll) {
        row.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'center' });
    }
    return true;
}

window.addEventListener('hashchange', () => applyHashRoute(true));

// Load and render performance chart
async function loadChart() {
    try {
        if (typeof Chart === 'undefined') {
            console.error('Chart.js not loaded');
            return;
        }

        // Check cache first
        const cachedChartData = getCachedData(CACHE_KEYS.chart, CACHE_KEYS.chartTimestamp);
        const cachedCurrentData = getCachedData(CACHE_KEYS.leaderboard, CACHE_KEYS.leaderboardTimestamp);
        
        if (cachedChartData && cachedCurrentData) {
            console.log('Using cached chart data');
            window.lastChartData = cachedChartData;
            window.lastLeaderboardData = cachedCurrentData;
            updateDramaContext(cachedChartData, cachedCurrentData);
            renderChart(cachedChartData, cachedCurrentData);
            renderZoomedChart(cachedChartData, cachedCurrentData);
            renderBumpChart(cachedChartData, cachedCurrentData);
            renderLeaderboard(cachedCurrentData);
            renderStats(cachedChartData, cachedCurrentData);

            // Fetch fresh data in background (don't wait for it)
            fetchChartInBackground();
            return;
        }
        
        // No valid cache, fetch from API
        await fetchChartData();
    } catch (error) {
        console.error('Error loading chart:', error);
        // Try to use cached data even if expired
        const cachedChartData = getCachedData(CACHE_KEYS.chart, CACHE_KEYS.chartTimestamp);
        const cachedCurrentData = getCachedData(CACHE_KEYS.leaderboard, CACHE_KEYS.leaderboardTimestamp);
        
        if (cachedChartData && cachedCurrentData) {
            console.log('Using expired cached data due to error');
            window.lastChartData = cachedChartData;
            window.lastLeaderboardData = cachedCurrentData;
            updateDramaContext(cachedChartData, cachedCurrentData);
            renderChart(cachedChartData, cachedCurrentData);
            renderZoomedChart(cachedChartData, cachedCurrentData);
            renderBumpChart(cachedChartData, cachedCurrentData);
            renderLeaderboard(cachedCurrentData);
            renderStats(cachedChartData, cachedCurrentData);
        }
    }
}

async function fetchChartData() {
    const url = `${API_BASE}/stocks/monthly`;
    console.log('Fetching chart data from API:', url);
    
    const response = await fetch(url);
    
    if (!response.ok) {
        const errorText = await response.text();
        console.error('Chart API error:', response.status, errorText);
        // If it's a 503, the API couldn't get data - show error message
        if (response.status === 503) {
            try {
                const errorData = JSON.parse(errorText);
                throw new Error(errorData.error || 'Service temporarily unavailable');
            } catch (e) {
                throw new Error('Service temporarily unavailable. Please try again later.');
            }
        }
        throw new Error(`API error: ${response.status}`);
    }
    
    const chartData = await response.json();
    
    // Validate that we have actual data
    if (!chartData || !chartData.data || !Array.isArray(chartData.data) || chartData.data.length === 0) {
        throw new Error('No valid chart data available');
    }
    console.log('Chart data received:', chartData);
    
    // Fetch current stock data to get accurate YTD percentages
    const currentResponse = await fetch(`${API_BASE}/stocks/current`);
    const currentData = await currentResponse.json();
    
    // Cache the data
    setCachedData(CACHE_KEYS.chart, CACHE_KEYS.chartTimestamp, chartData);
    // Current data is already cached by loadLeaderboard, but update it if we got fresh data
    if (currentData && Array.isArray(currentData) && currentData.length > 0) {
        setCachedData(CACHE_KEYS.leaderboard, CACHE_KEYS.leaderboardTimestamp, currentData);
    }
    
    // Store data for theme switching
    window.lastChartData = chartData;
    window.lastLeaderboardData = currentData;

    // Render the charts
    updateDramaContext(chartData, currentData);
    renderChart(chartData, currentData);
    renderZoomedChart(chartData, currentData);
    renderBumpChart(chartData, currentData);
    renderLeaderboard(currentData);
    renderStats(chartData, currentData);
}

async function fetchChartInBackground() {
    // Silently fetch fresh data in background
    try {
        const url = `${API_BASE}/stocks/monthly`;
        const response = await fetch(url);
        if (response.ok) {
            const chartData = await response.json();
            const currentResponse = await fetch(`${API_BASE}/stocks/current`);
            if (currentResponse.ok) {
                const currentData = await currentResponse.json();
                setCachedData(CACHE_KEYS.chart, CACHE_KEYS.chartTimestamp, chartData);
                setCachedData(CACHE_KEYS.leaderboard, CACHE_KEYS.leaderboardTimestamp, currentData);
                
                // Update leaderboard display with fresh data
                managerAnalyses = extractAnalysesFromLeaderboardData(currentData);

                // Re-render charts with fresh data
                window.lastChartData = chartData;
                window.lastLeaderboardData = currentData;
                updateDramaContext(chartData, currentData);
                renderChart(chartData, currentData);
                renderZoomedChart(chartData, currentData);
                renderBumpChart(chartData, currentData);
                renderLeaderboard(currentData);
                renderStats(chartData, currentData);
                
                console.log('Background refresh: chart and leaderboard data updated');
            }
        }
    } catch (error) {
        console.log('Background refresh failed (non-critical):', error.message);
    }
}

function renderChart(chartData, currentData) {
    // Create a map of symbol to YTD percentage for quick lookup
    const ytdMap = {};
    if (currentData && Array.isArray(currentData)) {
        currentData.forEach(stock => {
            ytdMap[stock.symbol] = stock.changePercent;
        });
    }
    
    const ctx = document.getElementById('performanceChart');
    if (!ctx) {
        console.error('Chart canvas element not found');
        return;
    }

    if (performanceChart) {
        performanceChart.destroy();
    }
    
    // Validate chartData
    if (!chartData || !chartData.data || !Array.isArray(chartData.data) || chartData.data.length === 0) {
        console.error('Invalid chartData:', chartData);
        return;
    }

    // Get current theme
    const currentTheme = document.documentElement.getAttribute('data-theme') || 'light';
    
    // Theme-aware colors
    const lightColors = [
        '#2563eb',  // Blue
        '#059669',  // Green
        '#dc2626',  // Red
        '#d97706',  // Amber
        '#7c3aed',  // Purple
        '#db2777',  // Pink
        '#0d9488',  // Teal
        '#ea580c',  // Orange
        '#16a34a',  // Emerald
        '#9333ea',  // Violet
        '#0284c7',  // Sky Blue
        '#ca8a04'   // Yellow
    ];
    
    const darkColors = [
        '#60a5fa',  // Soft Blue
        '#34d399',  // Soft Green
        '#f472b6',  // Soft Pink
        '#fbbf24',  // Soft Amber
        '#a78bfa',  // Soft Purple
        '#fb7185',  // Soft Rose
        '#2dd4bf',  // Soft Teal
        '#fb923c',  // Soft Orange
        '#84cc16',  // Soft Lime
        '#c084fc',  // Soft Violet
        '#38bdf8',  // Soft Sky
        '#facc15'   // Soft Yellow
    ];
    
    const colors = currentTheme === 'dark' ? darkColors : lightColors;
    
    // Custom color mapping for specific managers
    const managerColors = {
        'Greg': currentTheme === 'dark' ? '#a16207' : '#92400e'  // Bronze
    };
    
    // Detect mobile device
    const isMobile = window.innerWidth < 768;
    
    // Get labels from backend
    const labels = chartData.months || [];
    
    // Calculate dates for all data points (constant time frame)
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const currentYear = 2026;
    const firstTradingDay = new Date(2026, 0, 2); // Jan 2, 2026 - first trading day
    
    // Calculate dates for each data point
    // Note: Data now starts from Jan 2, 2026 (no Dec 31 baseline in display)
    const dates = [];
    
    // Helper function to check if a date is a trading day (reusable)
    const isTradingDay = (date) => {
        const day = date.getDay();
        if (day === 0 || day === 6) return false; // Weekend
        // Check 2026 holidays
        const month = date.getMonth();
        const dayOfMonth = date.getDate();
        const holidays2026 = [
            { month: 0, day: 1 }, { month: 0, day: 19 },
            { month: 1, day: 16 }, { month: 3, day: 3 },
            { month: 4, day: 25 }, { month: 6, day: 3 },
            { month: 8, day: 7 }, { month: 10, day: 11 },
            { month: 10, day: 26 }, { month: 11, day: 25 }
        ];
        return !holidays2026.some(h => h.month === month && h.day === dayOfMonth);
    };
    
    // Helper function to parse label (e.g., "Jan 2" or "Jan")
    const parseLabel = (label) => {
        const parts = label.trim().split(/\s+/);
        const monthName = parts[0];
        const day = parts.length > 1 ? parseInt(parts[1]) : null;
        const monthIndex = monthNames.indexOf(monthName);
        return { monthIndex, day, monthName };
    };
    
    // Calculate daily data count
    const baselineCount = 1;
    const dataLengths = chartData.data.map(d => (d.data || []).length);
    const maxDataPoints = dataLengths.length > 0 ? Math.max(...dataLengths) : 0;
    
    // Early return if there's no data to render
    if (maxDataPoints === 0) {
        console.warn('No data points available for chart rendering', {
            chartData: chartData,
            dataLengths: dataLengths
        });
        return;
    }
    
    // Check if labels contain specific days (e.g., "Jan 2") or just months (e.g., "Jan")
    const hasSpecificDays = labels.length > 0 && labels[0].includes(' ');
    
    if (hasSpecificDays) {
        // Labels contain specific days - parse them directly
        // Structure: baseline + daily data points for each label
        // We need (maxDataPoints - 1) dates after baseline
        const datesNeeded = maxDataPoints - 1;
        
        if (labels.length >= datesNeeded) {
            // We have enough labels, use them directly (but filter out weekends/holidays)
            for (let i = 0; i < datesNeeded; i++) {
                const { monthIndex, day } = parseLabel(labels[i]);
                if (monthIndex !== -1 && day !== null) {
                    const date = new Date(currentYear, monthIndex, day);
                    // Only add if it's a trading day
                    if (isTradingDay(date)) {
                        dates.push(date);
                    }
                }
            }
        } else {
            // We have fewer labels than needed, use labels and fill remaining
            let startDate = firstTradingDay; // Default to first trading day
            
            // Try to parse the first label to get a starting date
            if (labels.length > 0) {
                const firstLabel = parseLabel(labels[0]);
                if (firstLabel.monthIndex !== -1 && firstLabel.day !== null) {
                    const parsedDate = new Date(currentYear, firstLabel.monthIndex, firstLabel.day);
                    if (!isNaN(parsedDate.getTime()) && isTradingDay(parsedDate)) {
                        startDate = parsedDate;
                    }
                }
            }
            
            // Add dates starting from startDate, only trading days, up to today
            const today = new Date();
            today.setHours(23, 59, 59, 999);
            let currentDate = new Date(startDate);
            
            // Make sure we start from a valid trading day
            while (!isTradingDay(currentDate) && currentDate <= today && dates.length < maxDataPoints) {
                currentDate.setDate(currentDate.getDate() + 1);
            }
            
            // Generate dates up to maxDataPoints or today, whichever comes first
            let attempts = 0;
            const maxAttempts = 500; // Prevent infinite loop
            while (dates.length < maxDataPoints && currentDate <= today && attempts < maxAttempts) {
                if (isTradingDay(currentDate)) {
                    const date = new Date(currentDate);
                    if (!isNaN(date.getTime())) {
                        dates.push(date);
                    }
                }
                currentDate.setDate(currentDate.getDate() + 1);
                attempts++;
            }
            
            // If we still don't have enough dates and we've reached today, continue into the future
            // (but only up to a reasonable limit)
            if (dates.length < maxDataPoints && attempts < maxAttempts) {
                const futureLimit = new Date(today);
                futureLimit.setDate(futureLimit.getDate() + 30); // Allow up to 30 days in future
                while (dates.length < maxDataPoints && currentDate <= futureLimit && attempts < maxAttempts) {
                    if (isTradingDay(currentDate)) {
                        const date = new Date(currentDate);
                        if (!isNaN(date.getTime())) {
                            dates.push(date);
                        }
                    }
                    currentDate.setDate(currentDate.getDate() + 1);
                    attempts++;
                }
            }
        }
    } else {
        // Labels are just months - use month-end dates
        // But exclude the last month's month-end if we have daily data for it
        const lastMonthName = labels.length > 0 ? labels[labels.length - 1] : null;
        const { monthIndex: lastMonthIndex } = lastMonthName ? parseLabel(lastMonthName) : { monthIndex: -1 };
        
        // Calculate daily data count first to determine if we need to exclude last month-end
        const monthEndCount = labels.length;
        const dailyDataCount = maxDataPoints - baselineCount - monthEndCount;
        const hasDailyDataForLastMonth = dailyDataCount > 0;
        
        // Add month-end dates, but exclude the last month if we have daily data for it
        for (let i = 0; i < labels.length; i++) {
            const { monthIndex } = parseLabel(labels[i]);
            if (monthIndex !== -1) {
                // Skip the last month's month-end if we have daily data for it
                if (hasDailyDataForLastMonth && i === labels.length - 1 && monthIndex === lastMonthIndex) {
                    continue; // Skip adding month-end date for the last month
                }
                const lastDay = new Date(currentYear, monthIndex + 1, 0).getDate();
                dates.push(new Date(currentYear, monthIndex, lastDay));
            }
        }
        
        // Add daily dates for current month (if we have daily data)
        if (dailyDataCount > 0 && labels.length > 0 && lastMonthIndex !== -1 && lastMonthIndex >= 0 && lastMonthIndex < 12) {
            // Start from the first trading day of the month
            // Jan 1, 2026 is a holiday, so first trading day is Jan 2
            const firstTradingDay = (lastMonthIndex === 0 && currentYear === 2026) ? 2 : 1;
            for (let i = 0; i < dailyDataCount; i++) {
                const day = firstTradingDay + i;
                // Ensure day is valid (not exceeding month length)
                const date = new Date(currentYear, lastMonthIndex, day);
                if (!isNaN(date.getTime())) {
                    dates.push(date);
                } else {
                    console.warn(`Invalid date created: ${currentYear}-${lastMonthIndex + 1}-${day}`);
                }
            }
        }
    }
    
    // Ensure we have dates for all data points (only trading days)
    while (dates.length < maxDataPoints && dates.length > 0) {
        const lastDate = new Date(dates[dates.length - 1]);
        if (isNaN(lastDate.getTime())) {
            console.error('Invalid last date in dates array');
            break;
        }
        lastDate.setDate(lastDate.getDate() + 1);
        // Only add if it's a trading day
        let attempts = 0;
        const maxAttempts = 365; // Prevent infinite loop
        while (!isTradingDay(lastDate) && dates.length < maxDataPoints && attempts < maxAttempts) {
            lastDate.setDate(lastDate.getDate() + 1);
            attempts++;
        }
        if (dates.length < maxDataPoints && attempts < maxAttempts) {
            const newDate = new Date(lastDate);
            if (!isNaN(newDate.getTime())) {
                dates.push(newDate);
            } else {
                console.error('Created invalid date:', lastDate);
                break;
            }
        } else {
            break; // Prevent infinite loop
        }
    }
    
    // Trim to exact number of data points
    if (dates.length > maxDataPoints) {
        dates.length = maxDataPoints;
    }
    
    // Filter out invalid dates
    let validDates = dates.filter(d => {
        if (!(d instanceof Date)) return false;
        const time = d.getTime();
        return !isNaN(time) && isFinite(time);
    });
    
    // Absolute fallback: if we somehow still have no valid dates, synthesize a
    // continuous sequence of trading days starting from the first trading day.
    // This guarantees the chart will render even if labels/timestamps are odd.
    if (validDates.length === 0 && maxDataPoints > 0) {
        console.warn('No valid dates generated, using synthetic trading-day sequence', {
            maxDataPoints,
            originalDatesCount: dates.length,
            labels,
            hasSpecificDays
        });
        
        const syntheticDates = [];
        let currentDate = new Date(firstTradingDay);
        let attempts = 0;
        const maxAttempts = maxDataPoints * 10; // plenty of room while still bounded
        
        while (syntheticDates.length < maxDataPoints && attempts < maxAttempts) {
            if (isTradingDay(currentDate)) {
                const d = new Date(currentDate);
                if (!isNaN(d.getTime())) {
                    syntheticDates.push(d);
                }
            }
            currentDate.setDate(currentDate.getDate() + 1);
            attempts++;
        }
        
        if (syntheticDates.length === 0) {
            console.error('Failed to generate synthetic dates for chart', {
                maxDataPoints,
                attempts
            });
            return;
        }
        
        validDates = syntheticDates;
    }
    
    // Use valid (or synthetic) dates
    dates.length = 0;
    dates.push(...validDates);
    
    // Debug: log date calculation (only after we know dates are valid)
    try {
        console.log('Date calculation:', {
            maxDataPoints,
            datesCount: dates.length,
            firstDate: dates[0] ? dates[0].toISOString() : 'N/A',
            lastDate: dates[dates.length - 1] ? dates[dates.length - 1].toISOString() : 'N/A',
            labels,
            hasSpecificDays,
            dates: dates.map(d => d.toISOString().split('T')[0])
        });
    } catch (error) {
        console.error('Error logging dates:', error, {
            datesCount: dates.length,
            firstDate: dates[0],
            lastDate: dates[dates.length - 1]
        });
    }
    
    // Ensure we have exactly maxDataPoints dates (only trading days)
    if (dates.length !== maxDataPoints) {
        console.warn(`Date count mismatch: expected ${maxDataPoints}, got ${dates.length}`);
        // Fill or trim to match (only trading days)
        while (dates.length < maxDataPoints && dates.length > 0) {
            const lastDate = new Date(dates[dates.length - 1]);
            lastDate.setDate(lastDate.getDate() + 1);
            // Only add if it's a trading day
            while (!isTradingDay(lastDate) && dates.length < maxDataPoints) {
                lastDate.setDate(lastDate.getDate() + 1);
            }
            if (dates.length < maxDataPoints) {
                dates.push(new Date(lastDate));
            }
        }
        if (dates.length > maxDataPoints) {
            dates.length = maxDataPoints;
        }
    }
    
    // Create a mapping of timestamps to sequential trading day indices
    // This will compress weekends so Friday flows directly into Monday
    const today = new Date();
    today.setHours(23, 59, 59, 999); // End of today
    const todayTimestamp = today.getTime();
    
    const allUniqueTimestamps = [];
    chartData.data.forEach(stock => {
        const timestamps = stock.timestamps || [];
        timestamps.forEach((ts, idx) => {
            // Only include timestamps from Jan 2, 2026 up to today (no future dates)
            if (ts && ts >= firstTradingDay.getTime() && ts <= todayTimestamp && !allUniqueTimestamps.includes(ts)) {
                allUniqueTimestamps.push(ts);
            }
        });
    });
    // Note: we intentionally do NOT merge the synthetic `dates` array here.
    // Using only actual API timestamps keeps every x-axis index evenly spaced.
    // Sort timestamps and create index mapping (only up to today)
    allUniqueTimestamps.sort((a, b) => a - b);
    // Only use actual data timestamps (no synthetic dates) so every index
    // represents one real data point, giving a consistent x-axis scale.
    const filteredTimestamps = allUniqueTimestamps.filter(ts => ts <= todayTimestamp);
    const timestampToIndex = new Map();
    filteredTimestamps.forEach((ts, idx) => {
        timestampToIndex.set(ts, idx);
    });

    // Create label mapping from trading day indices to dates (only up to today)
    const indexToDateLabel = new Map();
    filteredTimestamps.forEach((ts, idx) => {
        const date = new Date(ts);
        const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        indexToDateLabel.set(idx, `${monthNames[date.getMonth()]} ${date.getDate()}`);
    });
    
    const datasets = chartData.data.map((stock, index) => {
        // Check for custom color first, then fall back to index-based assignment
        const color = managerColors[stock.name] || colors[index % colors.length];
        const data = stock.data || [];
        const timestamps = stock.timestamps || [];
        
        // Get the symbol to look up current YTD
        const symbol = stock.symbol;
        const currentYTD = ytdMap[symbol];
        
        // Use timestamps from API if available, otherwise fall back to calculated dates
        // Filter out any data points before Jan 2, 2026
        const firstTradingDayTimestamp = firstTradingDay.getTime();
        const timeData = data.map((value, idx) => {
            let timestamp;
            if (timestamps.length > idx && timestamps[idx]) {
                timestamp = timestamps[idx];
            } else {
                const date = dates[idx] || dates[0] || firstTradingDay;
                timestamp = date.getTime();
            }
            
            // Skip data points before Jan 2, 2026 or after today
            if (timestamp < firstTradingDayTimestamp || timestamp > todayTimestamp) {
                return null;
            }
            
            // Map timestamp to sequential trading day index (compresses weekends)
            // Only process timestamps up to today
            if (timestamp > todayTimestamp) {
                return null;
            }
            
            let tradingDayIndex = timestampToIndex.get(timestamp);
            if (tradingDayIndex === undefined) {
                // If timestamp not in map, add it (but only if it's not in the future)
                if (timestamp <= todayTimestamp && !allUniqueTimestamps.includes(timestamp)) {
                    allUniqueTimestamps.push(timestamp);
                    allUniqueTimestamps.sort((a, b) => a - b);
                    // Rebuild maps, filtering out future dates
                    timestampToIndex.clear();
                    indexToDateLabel.clear();
                    allUniqueTimestamps.forEach((ts, i) => {
                        // Only include timestamps up to today
                        if (ts <= todayTimestamp) {
                            timestampToIndex.set(ts, i);
                            const date = new Date(ts);
                            const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
                            indexToDateLabel.set(i, `${monthNames[date.getMonth()]} ${date.getDate()}`);
                        }
                    });
                    tradingDayIndex = timestampToIndex.get(timestamp);
                }
                if (tradingDayIndex === undefined) {
                    return null;
                }
            }
            
            // For the last data point, always use current YTD from leaderboard to ensure accuracy
            // This ensures chart labels match leaderboard YTD values
            let yValue = value;
            if (idx === data.length - 1 && currentYTD !== null && currentYTD !== undefined) {
                yValue = currentYTD;
            }
            
            return {
                x: tradingDayIndex,
                y: yValue
            };
        }).filter(point => point !== null); // Remove null entries
        
        // Calculate adaptive tension based on data density
        // More data points = smoother lines (lower tension)
        // Fewer data points = more responsive (higher tension)
        let adaptiveTension = 0.1; // Default - smoother
        if (timeData.length > 0) {
            const indexSpan = timeData[timeData.length - 1].x - timeData[0].x;
            // Since x is now trading day index, we can estimate data density
            // Each index represents one trading day
            const dataPointsPerTradingDay = timeData.length / Math.max(1, indexSpan);
            
            // Adjust tension based on data density (lower values = smoother)
            if (dataPointsPerTradingDay > 6) {
                // High density (hourly data) - very smooth
                adaptiveTension = 0.05;
            } else if (dataPointsPerTradingDay > 1) {
                // Medium density (daily data) - smooth
                adaptiveTension = 0.1;
            } else {
                // Low density (monthly data) - moderately smooth
                adaptiveTension = 0.2;
            }
        }
        
        return {
            label: `${stock.name} (${stock.symbol})`,
            data: timeData,
            borderColor: color,
            backgroundColor: color,
            borderWidth: isMobile ? 1.5 : 2,
            fill: false,
            tension: adaptiveTension,
            pointRadius: 0,
            pointHoverRadius: 0,
            pointBackgroundColor: color,
            pointBorderColor: '#ffffff',
            pointBorderWidth: 0,
            pointHoverBorderWidth: 0
        };
    });

    // Filter out datasets with no data first
    const validDatasets = datasets.filter(d => d.data && d.data.length > 0);
    
    if (validDatasets.length === 0) {
        console.error('All datasets have no data after filtering', {
            originalDatasetsCount: datasets.length,
            datasets: datasets.map(d => ({
                label: d.label,
                dataLength: d.data ? d.data.length : 0
            }))
        });
        return;
    }
    
    // First, find the current max trading-day index across all datasets
    let baseMaxIndex = 0;
    validDatasets.forEach(dataset => {
        if (dataset.data && dataset.data.length > 0) {
            const lastPoint = dataset.data[dataset.data.length - 1];
            if (lastPoint && lastPoint.x !== null && lastPoint.x !== undefined) {
                baseMaxIndex = Math.max(baseMaxIndex, lastPoint.x);
            }
        }
    });
    
    // Store the actual max index before extension (for x-axis tick generation)
    const actualMaxIndex = baseMaxIndex;
    
    // Extend every line horizontally to a common point slightly to the right
    const extensionDays = 5; // extend ~5 trading-day units to the right
    const extendedMaxIndex = baseMaxIndex + extensionDays;
    validDatasets.forEach(dataset => {
        if (dataset.data && dataset.data.length > 0) {
            const lastPoint = dataset.data[dataset.data.length - 1];
            if (lastPoint && lastPoint.x < extendedMaxIndex) {
                dataset.data.push({
                    x: extendedMaxIndex,
                    y: lastPoint.y
                });
            }
        }
    });
    
    // Calculate min and max trading day indices (for linear scale)
    // Use actualMaxIndex for x-axis to prevent duplicate labels, but extendedMaxIndex for line rendering
    let minIndex = 0;
    let maxIndex = actualMaxIndex; // Use actual data max, not extended max, for x-axis
    
    // Validate data before creating chart
    if (!validDatasets || validDatasets.length === 0) {
        console.error('No valid datasets to display', {
            chartData,
            datasets,
            currentData
        });
        return;
    }
    
    // Use only valid datasets
    const finalDatasets = validDatasets;
    
    console.log('Creating chart with:', {
        datasetsCount: finalDatasets.length,
        dataPointsPerDataset: finalDatasets[0]?.data?.length || 0,
        minIndex: minIndex,
        maxIndex: maxIndex,
        datasets: finalDatasets.map(d => ({
            label: d.label,
            dataLength: d.data.length,
            firstPoint: d.data[0],
            lastPoint: d.data[d.data.length - 1]
        }))
    });

    performanceChart = new Chart(ctx, {
            type: 'line',
            data: {
                datasets: finalDatasets
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    title: {
                        display: true,
                        text: 'YTD Performance',
                        position: 'top',
                        align: 'start',
                        fullSize: true,
                        color: currentTheme === 'dark' ? 'rgba(255, 255, 255, 0.5)' : '#999999',
                        font: {
                            size: isMobile ? 10 : 11,
                            weight: '500',
                            family: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
                        },
                        padding: {
                            top: isMobile ? 2 : 4,
                            bottom: isMobile ? 8 : 10
                        }
                    },
                    legend: {
                        display: false
                    },
                    tooltip: {
                        enabled: false
                    }
                },
                interaction: {
                    intersect: false,
                    mode: 'nearest'
                },
                scales: {
                    y: {
                        beginAtZero: false,
                        title: {
                            display: false
                        },
                        ticks: {
                            callback: function(value) {
                                const sign = value > 0 ? '+' : '';
                                return sign + value.toFixed(0) + '%';
                            },
                            color: currentTheme === 'dark' ? 'rgba(255, 255, 255, 0.4)' : '#aaaaaa',
                            font: {
                                size: isMobile ? 9 : 11,
                                weight: '400'
                            },
                            padding: isMobile ? 4 : 8
                        },
                        grid: {
                            color: currentTheme === 'dark' ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.05)',
                            lineWidth: 1,
                            drawBorder: false
                        }
                    },
                    x: {
                        type: 'linear',
                        min: minIndex - 0.5,
                        max: maxIndex + 0.5,
                        position: 'bottom',
                        title: {
                            display: false
                        },
                        display: true,
                        grid: {
                            display: false
                        },
                        // Place ticks on evenly spaced trading-day indices ourselves;
                        // Chart.js's auto ticks land on values with no date label
                        afterBuildTicks: (axis) => {
                            // Hard cap including the final-day tick appended below
                            const desiredTicks = isMobile ? 6 : 9;
                            const step = Math.max(1, Math.ceil(maxIndex / (desiredTicks - 1)));
                            const values = [];
                            for (let v = 0; v <= maxIndex; v += step) values.push(v);
                            const last = values[values.length - 1];
                            if (last !== maxIndex) {
                                // Keep the final (most recent) day labelled without crowding
                                if (maxIndex - last < step / 2 && values.length > 1) {
                                    values[values.length - 1] = maxIndex;
                                } else {
                                    values.push(maxIndex);
                                }
                            }
                            axis.ticks = values.map(v => ({ value: v }));
                        },
                        ticks: {
                            display: true,
                            autoSkip: false,
                            color: currentTheme === 'dark' ? 'rgba(255, 255, 255, 0.4)' : '#aaaaaa',
                            font: {
                                size: isMobile ? 9 : 11,
                                weight: '400'
                            },
                            maxRotation: 0,
                            minRotation: 0,
                            padding: isMobile ? 6 : 10,
                            callback: function(value, index, ticks) {
                                if (value === null || value === undefined) return '';
                                const tradingDayIndex = Math.round(value);
                                return indexToDateLabel.get(tradingDayIndex) || '';
                            }
                        }
                    }
                },
                layout: {
                    padding: {
                        right: isMobile ? 8 : 16,
                        left: isMobile ? 0 : 8,
                        top: isMobile ? 2 : 4,
                        bottom: isMobile ? 4 : 8
                    }
                },
                elements: {
                    point: {
                        hoverRadius: 0,
                        hoverBorderWidth: 0
                    }
                }
            },
            plugins: [{
                id: 'lineLabels',
                afterDatasetsDraw: (chart) => {
                    const ctx = chart.ctx;
                    const chartArea = chart.chartArea;
                    if (!chartArea) return;

                    const isMobile = window.innerWidth < 768;
                    const fontSize = isMobile
                        ? '500 7.5px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
                        : '500 11px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
                    const lineHeight = isMobile ? 11 : 16;
                    const padding = isMobile ? 2 : 4;
                    const labelTheme = document.documentElement.getAttribute('data-theme') || 'light';

                    ctx.font = fontSize;
                    ctx.textBaseline = 'middle';

                    const labelData = [];

                    chart.data.datasets.forEach((dataset, i) => {
                        const meta = chart.getDatasetMeta(i);
                        if (!meta || meta.hidden || !meta.data || meta.data.length === 0) return;

                        const lastPoint = meta.data[meta.data.length - 1];
                        if (!lastPoint || lastPoint.x === undefined || lastPoint.y === undefined) return;

                        const labelParts = dataset.label.split(' (');
                        const name = labelParts[0] || '';
                        const symbol = labelParts[1] ? labelParts[1].replace(')', '') : '';
                        const ytdPercent = ytdMap[symbol];
                        const ytdFormatted = ytdPercent !== null && ytdPercent !== undefined
                            ? `${ytdPercent >= 0 ? '+' : ''}${ytdPercent.toFixed(1)}%`
                            : '';

                        const labelText = isMobile
                            ? `${name} ${symbol} ${ytdFormatted}`
                            : `${name} • ${symbol} • ${ytdFormatted}`;

                        const textWidth = ctx.measureText(labelText).width;

                        labelData.push({
                            y: lastPoint.y,
                            labelText,
                            textWidth,
                            color: dataset.borderColor
                        });
                    });

                    if (labelData.length === 0) return;

                    const minSpacing = lineHeight + (isMobile ? 1 : 2);
                    const topBound = chartArea.top + lineHeight / 2 + 2;
                    const bottomBound = chartArea.bottom - lineHeight / 2 - 2;

                    labelData.sort((a, b) => a.y - b.y);

                    // Resolve collisions with a bounded top-down/bottom-up pass.
                    // This preserves label order while preventing stacked end labels
                    // from collapsing into each other near the chart edges.
                    labelData.forEach((label) => {
                        label.y = Math.max(topBound, Math.min(bottomBound, label.y));
                    });

                    for (let i = 1; i < labelData.length; i++) {
                        const previous = labelData[i - 1];
                        const current = labelData[i];
                        if (current.y - previous.y < minSpacing) {
                            current.y = previous.y + minSpacing;
                        }
                    }

                    if (labelData[labelData.length - 1].y > bottomBound) {
                        labelData[labelData.length - 1].y = bottomBound;
                    }

                    for (let i = labelData.length - 2; i >= 0; i--) {
                        const next = labelData[i + 1];
                        const current = labelData[i];
                        if (next.y - current.y < minSpacing) {
                            current.y = next.y - minSpacing;
                        }
                    }

                    if (labelData[0].y < topBound) {
                        labelData[0].y = topBound;
                        for (let i = 1; i < labelData.length; i++) {
                            const previous = labelData[i - 1];
                            const current = labelData[i];
                            if (current.y - previous.y < minSpacing) {
                                current.y = previous.y + minSpacing;
                            }
                        }
                    }

                    // Draw labels right-aligned to chart edge
                    const rightEdge = chartArea.right - 4;

                    labelData.forEach((label) => {
                        const rectWidth = label.textWidth + padding * 2;
                        const rectX = rightEdge - rectWidth;
                        const rectY = label.y - lineHeight / 2;
                        const rectHeight = lineHeight;

                        ctx.save();
                        ctx.font = fontSize;
                        ctx.textAlign = 'left';
                        ctx.textBaseline = 'middle';

                        // Background pill
                        ctx.fillStyle = labelTheme === 'dark'
                            ? 'rgba(15, 15, 15, 0.85)'
                            : 'rgba(255, 255, 255, 0.88)';
                        ctx.beginPath();
                        ctx.roundRect(rectX, rectY, rectWidth, rectHeight, isMobile ? 3 : 4);
                        ctx.fill();

                        // Left color accent bar
                        ctx.fillStyle = label.color;
                        ctx.beginPath();
                        ctx.roundRect(rectX, rectY, isMobile ? 2 : 3, rectHeight, [isMobile ? 3 : 4, 0, 0, isMobile ? 3 : 4]);
                        ctx.fill();

                        // Text
                        ctx.fillStyle = labelTheme === 'dark' ? 'rgba(255,255,255,0.9)' : 'rgba(0,0,0,0.8)';
                        ctx.fillText(label.labelText, rectX + padding + (isMobile ? 3 : 5), label.y);

                        ctx.restore();
                    });
                }
            }]
        });
}


function formatSignedPercentValue(value, decimals = 1) {
    if (value === null || value === undefined || Number.isNaN(Number(value))) return '-';
    const number = Number(value);
    return `${number >= 0 ? '+' : ''}${number.toFixed(decimals)}%`;
}

function renderPackSummary(stocksInRange, ytdMap, zoomMin, zoomMax) {
    const summary = document.getElementById('packSummary');
    if (!summary) return;

    if (!stocksInRange || stocksInRange.length === 0) {
        summary.innerHTML = `
            <span class="pack-pill muted">No managers in the ${zoomMin}% to +${zoomMax}% window</span>
        `;
        return;
    }

    const sortedPack = [...stocksInRange].sort((a, b) => (ytdMap[b.symbol] || 0) - (ytdMap[a.symbol] || 0));
    const leader = sortedPack[0];
    const trailer = sortedPack[sortedPack.length - 1];
    const spread = (ytdMap[leader.symbol] || 0) - (ytdMap[trailer.symbol] || 0);

    summary.innerHTML = `
        <span class="pack-pill">${stocksInRange.length} in view</span>
        <span class="pack-pill">Pack lead: ${escapeHtml(leader.name)} ${formatSignedPercentValue(ytdMap[leader.symbol])}</span>
        <span class="pack-pill">Spread: ${spread.toFixed(1)} pct pts</span>
    `;
}


function getRecentSeries(stock, ytdMap) {
    const data = Array.isArray(stock.data) ? [...stock.data] : [];
    const timestamps = Array.isArray(stock.timestamps) ? stock.timestamps : [];
    const todayTimestamp = Date.now();

    const values = data.filter((_, index) => !timestamps[index] || timestamps[index] <= todayTimestamp);
    if (values.length > 0 && ytdMap[stock.symbol] !== undefined) {
        values[values.length - 1] = ytdMap[stock.symbol];
    }
    return values;
}

function renderPackRace(stocksInRange, ytdMap, currentData, chartData, colors) {
    const container = document.getElementById('packRace');
    if (!container) return;

    if (!stocksInRange || stocksInRange.length === 0) {
        container.innerHTML = `<div class="empty-state"><p>No managers are currently inside the middle-pack range.</p></div>`;
        return;
    }

    const overallRanks = {};
    if (currentData && Array.isArray(currentData)) {
        [...currentData]
            .filter(stock => stock.changePercent !== null && stock.changePercent !== undefined)
            .sort((a, b) => b.changePercent - a.changePercent)
            .forEach((stock, index) => {
                overallRanks[stock.symbol] = index + 1;
            });
    }

    const sortedPack = [...stocksInRange].sort((a, b) => (ytdMap[b.symbol] || 0) - (ytdMap[a.symbol] || 0));
    const packLeadYtd = ytdMap[sortedPack[0].symbol] || 0;
    const packYtdValues = sortedPack.map(stock => ytdMap[stock.symbol]).filter(value => value !== undefined);
    const packMin = Math.min(...packYtdValues);
    const packMax = Math.max(...packYtdValues);
    const packRange = Math.max(packMax - packMin, 1);

    const rows = sortedPack.map((stock, index) => {
        const ytd = ytdMap[stock.symbol];
        const gapToLead = ytd - packLeadYtd;
        const overallRank = overallRanks[stock.symbol] ? `#${overallRanks[stock.symbol]}` : '-';
        const originalIndex = chartData.data.findIndex(item => item.symbol === stock.symbol);
        const color = colors[Math.max(0, originalIndex) % colors.length];
        const series = getRecentSeries(stock, ytdMap);
        const recentMove = series.length > 1 ? series[series.length - 1] - series[series.length - 2] : null;
        const position = ((ytd - packMin) / packRange) * 100;

        return `
            <div class="pack-ladder-row ${index === 0 ? 'pack-leader' : ''}">
                <div class="pack-ladder-identity">
                    <span class="pack-ladder-color" style="background: ${color};"></span>
                    <span class="pack-ladder-rank">${overallRank}</span>
                    <span class="pack-ladder-name-wrap">
                        <span class="pack-name">${escapeHtml(stock.name)}</span>
                        <span class="pack-symbol">${escapeHtml(stock.symbol)}</span>
                    </span>
                </div>
                <div class="pack-ladder-track" title="${escapeHtml(stock.name)} ${formatSignedPercentValue(ytd)}">
                    <span class="pack-ladder-dot" style="left: ${position.toFixed(1)}%; background: ${color};"></span>
                </div>
                <div class="pack-ladder-values">
                    <span class="pack-ladder-ytd ${ytd >= 0 ? 'positive' : 'negative'}">${formatSignedPercentValue(ytd)}</span>
                    <span class="pack-ladder-gap">${index === 0 ? 'Lead' : `${gapToLead.toFixed(1)} pct pts`}</span>
                    <span class="pack-ladder-recent ${recentMove === null ? 'no-data' : recentMove >= 0 ? 'positive' : 'negative'}">${recentMove === null ? '-' : formatSignedPercentValue(recentMove)}</span>
                </div>
            </div>
        `;
    }).join('');

    container.innerHTML = `
        <div class="pack-ladder">
            <div class="pack-ladder-header">
                <span class="pack-ladder-heading-label">Manager</span>
                <span></span>
                <div class="pack-ladder-value-headings">
                    <span>YTD</span>
                    <span>vs Lead</span>
                    <span>Recent</span>
                </div>
            </div>
            <div class="pack-ladder-list">
                ${rows}
            </div>
        </div>
    `;
}

// Rank bump chart: y-axis is rank (1 = leader), one line per manager.
// Normalizes away the outliers so every overtake is equally visible.
let bumpChart = null;

function renderBumpChart(chartData, currentData) {
    const ctx = document.getElementById('bumpChart');
    if (!ctx || typeof Chart === 'undefined') return;
    if (!chartData || !Array.isArray(chartData.data) || chartData.data.length === 0) return;

    if (bumpChart) {
        bumpChart.destroy();
        bumpChart = null;
    }

    const currentTheme = document.documentElement.getAttribute('data-theme') || 'light';
    const isMobile = window.innerWidth < 768;

    // Same palette and per-manager overrides as the main chart so colors match
    const lightColors = [
        '#2563eb', '#059669', '#dc2626', '#d97706', '#7c3aed',
        '#db2777', '#0d9488', '#ea580c', '#16a34a', '#9333ea',
        '#0284c7', '#ca8a04'
    ];
    const darkColors = [
        '#60a5fa', '#34d399', '#f472b6', '#fbbf24', '#a78bfa',
        '#fb7185', '#2dd4bf', '#fb923c', '#84cc16', '#c084fc',
        '#38bdf8', '#facc15'
    ];
    const colors = currentTheme === 'dark' ? darkColors : lightColors;
    const managerColors = {
        'Greg': currentTheme === 'dark' ? '#a16207' : '#92400e'
    };

    // Bucket each series to its last value per calendar day
    const dayMap = new Map(); // dayKey -> { symbol: ytd }
    chartData.data.forEach(stock => {
        if (!Array.isArray(stock.timestamps) || !Array.isArray(stock.data)) return;
        stock.timestamps.forEach((ts, i) => {
            const dayKey = new Date(ts).toISOString().split('T')[0];
            if (!dayMap.has(dayKey)) dayMap.set(dayKey, {});
            dayMap.get(dayKey)[stock.symbol] = stock.data[i];
        });
    });
    const dayKeys = [...dayMap.keys()].sort();
    if (dayKeys.length === 0) return;

    // Rank everyone per day, carrying forward the last known value so a
    // stock with a missing day keeps a continuous line
    const lastValue = {};
    const ranksByDay = dayKeys.map(dayKey => {
        const values = dayMap.get(dayKey);
        Object.keys(values).forEach(symbol => { lastValue[symbol] = values[symbol]; });
        const ranked = Object.keys(lastValue).sort((a, b) => lastValue[b] - lastValue[a]);
        const ranks = {};
        ranked.forEach((symbol, i) => { ranks[symbol] = i + 1; });
        return ranks;
    });

    // Final day mirrors the leaderboard order (dividend-inclusive) when available
    if (currentData && Array.isArray(currentData)) {
        const sorted = currentData
            .filter(s => s.changePercent !== null && s.changePercent !== undefined)
            .sort((a, b) => b.changePercent - a.changePercent);
        const lastRanks = ranksByDay[ranksByDay.length - 1];
        if (sorted.length === Object.keys(lastRanks).length) {
            const finalRanks = {};
            sorted.forEach((s, i) => { finalRanks[s.symbol] = i + 1; });
            ranksByDay[ranksByDay.length - 1] = finalRanks;
        }
    }

    // On mobile, sample one rank snapshot per week (plus today) — daily rank
    // jitter turns the small screen into spaghetti while the real overtakes
    // survive sampling just fine
    const sampleStep = isMobile ? 5 : 1;
    const plotDayIndices = [];
    for (let i = 0; i < dayKeys.length; i += sampleStep) plotDayIndices.push(i);
    if (plotDayIndices[plotDayIndices.length - 1] !== dayKeys.length - 1) {
        plotDayIndices.push(dayKeys.length - 1);
    }

    const maxIdx = plotDayIndices.length - 1;
    const managerCount = Object.keys(ranksByDay[ranksByDay.length - 1]).length;

    const indexToDateLabel = new Map();
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    plotDayIndices.forEach((dayIdx, idx) => {
        const date = new Date(dayKeys[dayIdx] + 'T12:00:00');
        indexToDateLabel.set(idx, `${monthNames[date.getMonth()]} ${date.getDate()}`);
    });

    const datasets = chartData.data.map((stock, index) => {
        const color = managerColors[stock.name] || colors[index % colors.length];
        const data = [];
        plotDayIndices.forEach((dayIdx, plotIdx) => {
            const ranks = ranksByDay[dayIdx];
            if (ranks[stock.symbol] !== undefined) {
                data.push({ x: plotIdx, y: ranks[stock.symbol] });
            }
        });
        return {
            label: `${stock.name} ${stock.symbol}`,
            data: data,
            borderColor: color,
            backgroundColor: color,
            borderWidth: isMobile ? 1.5 : 2,
            pointRadius: 0,
            cubicInterpolationMode: 'monotone',
            fill: false
        };
    }).filter(d => d.data.length > 0);

    if (datasets.length === 0) return;

    bumpChart = new Chart(ctx, {
        type: 'line',
        data: { datasets },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: { enabled: false }
            },
            interaction: { intersect: false, mode: 'nearest' },
            layout: {
                padding: {
                    right: isMobile ? 64 : 130,
                    left: 0,
                    top: 4,
                    bottom: 4
                }
            },
            scales: {
                y: {
                    reverse: true,
                    min: 0.5,
                    max: managerCount + 0.5,
                    afterBuildTicks: (axis) => {
                        const values = [];
                        for (let r = 1; r <= managerCount; r++) values.push(r);
                        axis.ticks = values.map(v => ({ value: v }));
                    },
                    ticks: {
                        callback: value => '#' + value,
                        color: currentTheme === 'dark' ? 'rgba(255, 255, 255, 0.4)' : '#aaaaaa',
                        font: { size: isMobile ? 8 : 10, weight: '400' },
                        padding: isMobile ? 2 : 6
                    },
                    grid: {
                        color: currentTheme === 'dark' ? 'rgba(255, 255, 255, 0.04)' : 'rgba(0, 0, 0, 0.04)',
                        lineWidth: 1,
                        drawBorder: false
                    }
                },
                x: {
                    type: 'linear',
                    min: -0.5,
                    max: maxIdx + 0.5,
                    position: 'bottom',
                    grid: { display: false },
                    afterBuildTicks: (axis) => {
                        const desiredTicks = isMobile ? 6 : 9;
                        const step = Math.max(1, Math.ceil(maxIdx / (desiredTicks - 1)));
                        const values = [];
                        for (let v = 0; v <= maxIdx; v += step) values.push(v);
                        const last = values[values.length - 1];
                        if (last !== maxIdx) {
                            if (maxIdx - last < step / 2 && values.length > 1) {
                                values[values.length - 1] = maxIdx;
                            } else {
                                values.push(maxIdx);
                            }
                        }
                        axis.ticks = values.map(v => ({ value: v }));
                    },
                    ticks: {
                        autoSkip: false,
                        color: currentTheme === 'dark' ? 'rgba(255, 255, 255, 0.4)' : '#aaaaaa',
                        font: { size: isMobile ? 9 : 11, weight: '400' },
                        maxRotation: 0,
                        minRotation: 0,
                        padding: isMobile ? 6 : 10,
                        callback: function(value) {
                            return indexToDateLabel.get(Math.round(value)) || '';
                        }
                    }
                }
            },
            elements: {
                point: { hoverRadius: 0, hoverBorderWidth: 0 }
            }
        },
        plugins: [{
            id: 'bumpEndLabels',
            afterDatasetsDraw: (chart) => {
                const chartCtx = chart.ctx;
                if (!chart.chartArea) return;
                const mobile = window.innerWidth < 768;
                chartCtx.save();
                chartCtx.font = mobile
                    ? '500 7.5px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
                    : '500 11px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
                chartCtx.textBaseline = 'middle';
                chartCtx.textAlign = 'left';

                chart.data.datasets.forEach((dataset, i) => {
                    const meta = chart.getDatasetMeta(i);
                    if (!meta || meta.hidden || !meta.data || meta.data.length === 0) return;
                    const lastPoint = meta.data[meta.data.length - 1];
                    if (!lastPoint) return;
                    chartCtx.fillStyle = dataset.borderColor;
                    chartCtx.fillText(dataset.label, lastPoint.x + (mobile ? 4 : 8), lastPoint.y);
                });

                chartCtx.restore();
            }
        }]
    });
}

function renderZoomedChart(chartData, currentData) {
    if (!chartData || !chartData.data || chartData.data.length === 0) return;

    const currentTheme = document.documentElement.getAttribute('data-theme') || 'light';

    const ytdMap = {};
    if (currentData && Array.isArray(currentData)) {
        currentData.forEach(stock => { ytdMap[stock.symbol] = stock.changePercent; });
    }

    const ZOOM_MIN = -18;
    const ZOOM_MAX = 15;

    const lightColors = [
        '#2563eb', '#059669', '#dc2626', '#d97706', '#7c3aed',
        '#db2777', '#0d9488', '#ea580c', '#16a34a', '#9333ea',
        '#0284c7', '#ca8a04'
    ];
    const darkColors = [
        '#60a5fa', '#34d399', '#f472b6', '#fbbf24', '#a78bfa',
        '#fb7185', '#2dd4bf', '#fb923c', '#84cc16', '#c084fc',
        '#38bdf8', '#facc15'
    ];
    const colors = currentTheme === 'dark' ? darkColors : lightColors;

    // Filter to only stocks within the zoomed range
    const stocksInRange = chartData.data.filter(stock => {
        const ytd = ytdMap[stock.symbol];
        return ytd !== undefined && ytd >= ZOOM_MIN && ytd <= ZOOM_MAX;
    });

    renderPackSummary(stocksInRange, ytdMap, ZOOM_MIN, ZOOM_MAX);
    renderPackRace(stocksInRange, ytdMap, currentData, chartData, colors);
}

// Render statistics section
function renderStats(chartData, currentData) {
    const grid = document.getElementById('statsGrid');
    if (!grid || !currentData || !Array.isArray(currentData) || currentData.length === 0) return;

    const validStocks = [...currentData]
        .filter(s => s.changePercent !== null && s.changePercent !== undefined)
        .sort((a, b) => b.changePercent - a.changePercent);

    if (validStocks.length === 0) {
        grid.innerHTML = `<div class="empty-state"><p>No statistics available yet.</p></div>`;
        return;
    }

    // Calculate group stats
    const ytdValues = validStocks.map(s => s.changePercent);
    const avg = ytdValues.reduce((a, b) => a + b, 0) / ytdValues.length;
    const sortedYtdValues = [...ytdValues].sort((a, b) => a - b);
    const middleIndex = Math.floor(sortedYtdValues.length / 2);
    const median = sortedYtdValues.length % 2 === 0
        ? (sortedYtdValues[middleIndex - 1] + sortedYtdValues[middleIndex]) / 2
        : sortedYtdValues[middleIndex];
    const variance = ytdValues.reduce((sum, v) => sum + Math.pow(v - avg, 2), 0) / ytdValues.length;
    const stdDev = Math.sqrt(variance);
    const positiveCount = ytdValues.filter(v => v >= 0).length;
    const aboveAverageCount = ytdValues.filter(v => v >= avg).length;
    const leader = validStocks[0];
    const laggard = validStocks[validStocks.length - 1];
    const fieldSpread = leader.changePercent - laggard.changePercent;
    const distributionPadding = Math.max(fieldSpread * 0.06, 2);
    let distributionMin = laggard.changePercent - distributionPadding;
    let distributionMax = leader.changePercent + distributionPadding;

    if (!Number.isFinite(distributionMin) || !Number.isFinite(distributionMax) || distributionMax <= distributionMin) {
        distributionMin = avg - 5;
        distributionMax = avg + 5;
    }

    const distributionRange = distributionMax - distributionMin;
    const safeStdDev = stdDev > 0 ? stdDev : distributionRange / 6;
    const getDistributionPosition = value => {
        const position = ((value - distributionMin) / distributionRange) * 100;
        return Math.min(100, Math.max(0, position));
    };
    const getDensity = value => Math.exp(-0.5 * Math.pow((value - avg) / safeStdDev, 2));
    const getZScore = value => stdDev > 0 ? (value - avg) / stdDev : 0;
    const formatZScore = value => `${value >= 0 ? '+' : ''}${value.toFixed(1)}`;

    const curvePoints = Array.from({ length: 49 }, (_, index) => {
        const x = (index / 48) * 100;
        const value = distributionMin + (distributionRange * index / 48);
        const y = 78 - (getDensity(value) * 48);
        return { x, y };
    });
    const curvePath = curvePoints
        .map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`)
        .join(' ');
    const curveAreaPath = `${curvePath} L 100 84 L 0 84 Z`;

    const dotLanes = [34, 46, 58, 70];
    const laneRightEdges = dotLanes.map(() => -Infinity);
    const dotGap = 1.2;

    const distributionDots = [...validStocks]
        .sort((a, b) => a.changePercent - b.changePercent)
        .map(stock => {
            const x = getDistributionPosition(stock.changePercent);
            const directionClass = stock.changePercent >= 0 ? 'positive' : 'negative';
            const zScore = getZScore(stock.changePercent);
            const zScoreText = formatZScore(zScore);
            const label = `${stock.symbol}: ${formatSignedPercentValue(stock.changePercent)} YTD, z-score ${zScoreText}`;
            const dotHalfWidth = 1.2;
            const dotX = Math.min(100 - dotHalfWidth, Math.max(dotHalfWidth, x));
            const laneIndex = laneRightEdges.findIndex(rightEdge => dotX - dotHalfWidth > rightEdge + dotGap);
            const assignedLane = laneIndex === -1
                ? laneRightEdges.indexOf(Math.min(...laneRightEdges))
                : laneIndex;

            laneRightEdges[assignedLane] = dotX + dotHalfWidth;

            return `
                <span class="distribution-stock ${directionClass}" style="left: ${dotX.toFixed(2)}%; top: ${dotLanes[assignedLane].toFixed(2)}%;" title="${escapeHtml(label)}" aria-label="${escapeHtml(label)}"></span>
            `;
        }).join('');

    const distributionLegend = [...validStocks]
        .sort((a, b) => getZScore(b.changePercent) - getZScore(a.changePercent))
        .map(stock => {
            const zScore = getZScore(stock.changePercent);
            const zScoreClass = Math.abs(zScore) >= 1 ? 'uncommon' : 'common';
            const directionClass = stock.changePercent >= 0 ? 'positive' : 'negative';

            return `
                <span class="distribution-chip ${directionClass}">
                    <span class="distribution-chip-symbol">${escapeHtml(stock.symbol)}</span>
                    <span class="distribution-chip-z ${zScoreClass}">z ${formatZScore(zScore)}</span>
                    <span class="distribution-chip-return">${formatSignedPercentValue(stock.changePercent)}</span>
                </span>
            `;
        }).join('');

    const avgPosition = getDistributionPosition(avg);
    const medianPosition = getDistributionPosition(median);
    const zeroMarker = distributionMin < 0 && distributionMax > 0
        ? `<span class="distribution-zero" style="left: ${getDistributionPosition(0).toFixed(2)}%;" aria-hidden="true"></span>`
        : '';

    const leaderDays = dramaContext && dramaContext.daysInLead
        ? dramaContext.daysInLead[leader.symbol]
        : null;

    let dramaCardsHtml = '';
    if (dramaContext && dramaContext.biggestMover) {
        const mover = dramaContext.biggestMover;
        dramaCardsHtml += `
            <div class="summary-card">
                <span class="summary-label">Biggest mover (7d)</span>
                <strong>${escapeHtml(mover.name || mover.symbol)}</strong>
                <span class="summary-value ${mover.move >= 0 ? 'positive' : 'negative'}">${formatSignedPercentValue(mover.move)} this week</span>
            </div>
        `;
    }
    if (dramaContext && dramaContext.biggestComeback) {
        const comeback = dramaContext.biggestComeback;
        dramaCardsHtml += `
            <div class="summary-card">
                <span class="summary-label">Biggest comeback (7d)</span>
                <strong>${escapeHtml(comeback.name || comeback.symbol)}</strong>
                <span class="summary-note">&#9650;${comeback.rankDelta} place${comeback.rankDelta === 1 ? '' : 's'} this week</span>
            </div>
        `;
    }

    const summaryHtml = `
        <div class="stats-summary">
            <div class="summary-card featured">
                <span class="summary-label">Field leader</span>
                <strong>${escapeHtml(leader.name)}</strong>
                <span class="summary-value positive">${formatSignedPercentValue(leader.changePercent)}</span>
                ${leaderDays ? `<span class="summary-note">${leaderDays} trading day${leaderDays === 1 ? '' : 's'} in the lead</span>` : ''}
            </div>
            <div class="summary-card">
                <span class="summary-label">Average return</span>
                <strong>${formatSignedPercentValue(avg)}</strong>
                <span class="summary-note">${aboveAverageCount}/${validStocks.length} above average</span>
            </div>
            <div class="summary-card">
                <span class="summary-label">Median return</span>
                <strong>${formatSignedPercentValue(median)}</strong>
                <span class="summary-note">Middle of the field</span>
            </div>
            <div class="summary-card">
                <span class="summary-label">Positive picks</span>
                <strong>${positiveCount}/${validStocks.length}</strong>
                <span class="summary-note">${Math.round((positiveCount / validStocks.length) * 100)}% of the field</span>
            </div>
            <div class="summary-card">
                <span class="summary-label">Field spread</span>
                <strong>${fieldSpread.toFixed(1)} pct pts</strong>
                <span class="summary-note">Leader to laggard</span>
            </div>
            <div class="summary-card">
                <span class="summary-label">Dispersion</span>
                <strong>${stdDev.toFixed(1)} pct pts</strong>
                <span class="summary-note">Standard deviation</span>
            </div>
            ${dramaCardsHtml}
        </div>
    `;

    const distributionHtml = `
        <div class="stats-distribution">
            <div class="distribution-header">
                <div>
                    <strong>Distribution</strong>
                    <span>Dots show YTD return. Z-scores are listed below to show distance from the field average.</span>
                </div>
                <span class="distribution-range">${formatSignedPercentValue(laggard.changePercent)} to ${formatSignedPercentValue(leader.changePercent)}</span>
            </div>
            <div class="distribution-plot" role="img" aria-label="YTD return distribution for all competition stocks">
                <svg class="distribution-curve" viewBox="0 0 100 86" preserveAspectRatio="none" aria-hidden="true">
                    <path class="distribution-area" d="${curveAreaPath}"></path>
                    <path class="distribution-line" d="${curvePath}"></path>
                </svg>
                ${zeroMarker}
                <span class="distribution-marker distribution-marker-average" style="left: ${avgPosition.toFixed(2)}%;" aria-label="Average return ${formatSignedPercentValue(avg)}"></span>
                <span class="distribution-marker distribution-marker-median" style="left: ${medianPosition.toFixed(2)}%;" aria-label="Median return ${formatSignedPercentValue(median)}"></span>
                ${distributionDots}
            </div>
            <div class="distribution-axis" aria-hidden="true">
                <span>${formatSignedPercentValue(distributionMin)}</span>
                <span>Avg ${formatSignedPercentValue(avg)} / Med ${formatSignedPercentValue(median)}</span>
                <span>${formatSignedPercentValue(distributionMax)}</span>
            </div>
            <div class="distribution-legend" aria-label="Stock z-scores">
                ${distributionLegend}
            </div>
        </div>
    `;

    grid.innerHTML = summaryHtml + distributionHtml;
}

// Check if US stock market is currently open (client-side check)
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
    
    return time >= marketOpen && time < marketClose;
}

// Auto-refresh every 30 minutes to avoid rate limits
setInterval(() => {
    if (isMarketOpen()) {
        // Market hours: refresh every 30 minutes
        loadLeaderboard();
        loadIndexes();
        loadChart();
    }
}, 1800000); // 30 minutes (1,800,000 milliseconds)

// Load Indexes
async function loadIndexes() {
    try {
        const url = `${API_BASE}/indexes`;
        const response = await fetch(url);
        
        if (!response.ok) {
            console.error('Index API failed:', response.status);
            indexes.innerHTML = `<div class="error-message">Failed to load index data. Please try again later.</div>`;
            return;
        }
        
        const data = await response.json();
        
        // Log the data we received for debugging
        console.log('Index data received from API:', data);
        
        // If we got empty data or all null values, show error
        if (!data || data.length === 0 || (Array.isArray(data) && data.every(d => !d || (d.changePercent === null && d.change1d === null)))) {
            console.error('Index API returned no valid data');
            indexes.innerHTML = `<div class="error-message">Failed to load index data. Please try again later.</div>`;
            return;
        }
        
        try {
            localStorage.setItem('stock_competition_indexes', JSON.stringify(data));
        } catch (error) {
            console.log('Unable to cache index data:', error.message);
        }

        renderIndexes(data);
        if (window.lastChartData && window.lastLeaderboardData) {
            renderLeaderboard(window.lastLeaderboardData);
            renderStats(window.lastChartData, window.lastLeaderboardData);
        }
    } catch (error) {
        console.error('Error loading indexes:', error);
        // Show error instead of fallback data
        indexes.innerHTML = `<div class="error-message">Failed to load index data: ${error.message}</div>`;
    }
}

function renderIndexes(data) {
    if (!data || data.length === 0) {
        indexes.innerHTML = `
            <div class="empty-state">
                <p>No index data available.</p>
            </div>
        `;
        return;
    }
    
    indexes.innerHTML = data.map((index) => {
        const changePercentClass = index.changePercent !== null ? (index.changePercent >= 0 ? 'positive' : 'negative') : 'no-data';
        const ytdValue = index.changePercent !== null 
            ? getChangeSign(index.changePercent) + formatPercent(index.changePercent) + '%' 
            : '-';
        
        const change1dClass = index.change1d !== null ? (index.change1d >= 0 ? 'positive' : 'negative') : 'no-data';
        const change1dValue = index.change1d !== null 
            ? getChangeSign(index.change1d) + formatPercent(index.change1d) + '%' 
            : '-';
        
        return `
            <div class="index-item">
                <span class="index-symbol">${escapeHtml(index.symbol)}</span>
                <span class="index-changes">
                    <span class="index-1d-wrapper">
                        <span class="index-1d ${change1dClass}">${change1dValue}</span>
                        <span class="index-1d-label">1d</span>
                    </span>
                    <span class="index-ytd-wrapper">
                        <span class="index-ytd ${changePercentClass}">${ytdValue}</span>
                        <span class="index-ytd-label">YTD</span>
                    </span>
                </span>
            </div>
        `;
    }).join('');
}

// Load Dividends
async function loadDividends() {
    const container = document.getElementById('dividends');
    if (!container) return;
    try {
        const response = await fetch(`${API_BASE}/dividends`);
        if (!response.ok) {
            container.innerHTML = `<div class="error-message">Failed to load dividend data. Please try again later.</div>`;
            return;
        }
        const data = await response.json();
        if (!data || !Array.isArray(data) || data.length === 0) {
            container.innerHTML = `<div class="empty-state"><p>No dividend data available.</p></div>`;
            return;
        }
        renderDividends(data);
    } catch (error) {
        console.error('Error loading dividends:', error);
        container.innerHTML = `<div class="error-message">Failed to load dividend data. Please try again later.</div>`;
    }
}

function renderDividends(data) {
    const container = document.getElementById('dividends');
    if (!container) return;

    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const formatExDate = iso => {
        const date = new Date(iso + 'T12:00:00');
        return `${monthNames[date.getMonth()]} ${date.getDate()}`;
    };

    const payers = data
        .filter(d => d.totalPerShare > 0)
        .sort((a, b) => (b.yieldPct || 0) - (a.yieldPct || 0));
    const nonPayers = data.filter(d => !d.totalPerShare || d.totalPerShare <= 0);

    if (payers.length === 0) {
        container.innerHTML = `<div class="empty-state"><p>No dividends paid in 2026 yet.</p></div>`;
        return;
    }

    const rows = payers.map(item => {
        const paymentChips = item.payments.map(p => `
            <span class="dividend-payment">${formatExDate(p.date)} &middot; $${p.amount.toFixed(p.amount < 0.1 ? 3 : 2)}</span>
        `).join('');

        return `
            <div class="dividend-row">
                <div class="dividend-identity">
                    <span class="dividend-name">${escapeHtml(item.name)}</span>
                    <span class="dividend-symbol">${escapeHtml(item.symbol)}</span>
                </div>
                <div class="dividend-payments">${paymentChips}</div>
                <div class="dividend-totals">
                    <span class="dividend-total">$${item.totalPerShare.toFixed(2)}/share</span>
                    <span class="dividend-yield">${item.yieldPct !== null ? '+' + item.yieldPct.toFixed(2) + '% to YTD' : '-'}</span>
                </div>
            </div>
        `;
    }).join('');

    const footnote = nonPayers.length > 0
        ? `<p class="dividends-footnote">No 2026 dividends: ${nonPayers.map(d => `${escapeHtml(d.symbol)} (${escapeHtml(d.name)})`).join(', ')}</p>`
        : '';

    container.innerHTML = `
        <div class="dividend-list">${rows}</div>
        ${footnote}
    `;
}

// Initial load
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        loadLeaderboard();
        loadIndexes();
        loadDividends();
        setTimeout(loadChart, 100);
    });
} else {
    loadLeaderboard();
    loadIndexes();
    loadDividends();
    setTimeout(loadChart, 100);
}

