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

// Mock data for testing (hardcoded managers list)
const MOCK_MANAGERS = [
    { name: "Daniel", stockSymbol: "NBIS" },
    { name: "Sam", stockSymbol: "NVDA" },
    { name: "Szklarek", stockSymbol: "WY" },
    { name: "Cale", stockSymbol: "NVO" },
    { name: "Charlie", stockSymbol: "TSLA" },
    { name: "Kruse", stockSymbol: "AMTM" },
    { name: "Kyle", stockSymbol: "PLTR" },
    { name: "Adam", stockSymbol: "JPM" },
    { name: "Carson", stockSymbol: "AMZN" },
    { name: "Grant", stockSymbol: "WM" },
    { name: "Nick", stockSymbol: "PM" },
    { name: "Pierino", stockSymbol: "CRCL" }
];

// Generate fake leaderboard data
function generateMockLeaderboardData() {
    const today = new Date();
    const yearStart = new Date(2026, 0, 1);
    const actualDaysSinceStart = Math.floor((today - yearStart) / (1000 * 60 * 60 * 24));
    const daysSinceStart = actualDaysSinceStart < 0 ? 14 : Math.max(0, actualDaysSinceStart);
    
    // Stock patterns (matching chart patterns) - trend is now annual return multiplier
    // Best performer (Kyle - PLTR) should reach 110% by end of year
    // 2 stocks are negative: Charlie (TSLA) and Nick (PM)
    const stockPatterns = [
        { base: 0, trend: 0.75, volatility: 0.40, momentum: 0.10 },  // Daniel - NBIS (75% annual)
        { base: 0, trend: 1.00, volatility: 0.75, momentum: 0.15 },  // Sam - NVDA (100% annual)
        { base: 0, trend: 0.50, volatility: 0.20, momentum: 0.05 }, // Szklarek - WY (50% annual)
        { base: 0, trend: 0.90, volatility: 0.30, momentum: 0.125 }, // Cale - NVO (90% annual)
        { base: 0, trend: -0.20, volatility: 0.60, momentum: -0.05 }, // Charlie - TSLA (-20% annual - NEGATIVE)
        { base: 0, trend: 0.40, volatility: 0.15, momentum: 0.04 }, // Kruse - AMTM (40% annual)
        { base: 0, trend: 1.10, volatility: 0.50, momentum: 0.10 },  // Kyle - PLTR (110% annual - best performer)
        { base: 0, trend: 0.60, volatility: 0.25, momentum: 0.075 }, // Adam - JPM (60% annual)
        { base: 0, trend: 0.70, volatility: 0.25, momentum: 0.09 }, // Carson - AMZN (70% annual)
        { base: 0, trend: 0.45, volatility: 0.15, momentum: 0.05 },  // Grant - WM (45% annual)
        { base: 0, trend: -0.15, volatility: 0.15, momentum: -0.02 }, // Nick - PM (-15% annual - NEGATIVE)
        { base: 0, trend: 0.80, volatility: 0.35, momentum: 0.10 }   // Pierino - CRCL (80% annual)
    ];
    
    const results = MOCK_MANAGERS.map((manager, index) => {
        const symbol = manager.stockSymbol;
        const pattern = stockPatterns[index] || stockPatterns[0];
        
        // Calculate YTD percentage based on pattern (less random)
        // Scale to ensure best performer reaches 100%+ over full year (~252 trading days)
        // pattern.trend is now a multiplier for annual return (1.10 = 110% annual)
        const tradingDaysPerYear = 252;
        const annualReturn = pattern.trend; // e.g., 1.10 = 110%
        const dailyReturn = annualReturn / tradingDaysPerYear; // Convert to daily
        const trendComponent = daysSinceStart * dailyReturn;
        
        const momentumComponent = daysSinceStart * pattern.momentum / 100;
        // Reduce volatility by 70% for more consistent data
        const dailyVolatility = (Math.random() - 0.5) * pattern.volatility * 0.3;
        const ytdPercent = (pattern.base + trendComponent + momentumComponent + dailyVolatility) * 100;
        
        // Calculate mock prices
        const basePrice = 100;
        const currentPrice = basePrice * (1 + ytdPercent / 100);
        
        // Calculate 1d change (much smaller variation, closer to YTD)
        const change1d = ytdPercent + (Math.random() - 0.5) * 0.1;
        
        // Calculate 1m and 3m (only if enough time has passed)
        let change1m = null;
        let change3m = null;
        
        if (daysSinceStart >= 30) {
            const oneMonthTrend = Math.max(0, daysSinceStart - 30) * pattern.trend / 100;
            const oneMonthMomentum = Math.max(0, daysSinceStart - 30) * pattern.momentum / 100;
            // Reduce volatility for 1m calculation
            change1m = (pattern.base + oneMonthTrend + oneMonthMomentum + (Math.random() - 0.5) * pattern.volatility * 0.3) * 100;
        }
        
        if (daysSinceStart >= 90) {
            const threeMonthTrend = Math.max(0, daysSinceStart - 90) * pattern.trend / 100;
            const threeMonthMomentum = Math.max(0, daysSinceStart - 90) * pattern.momentum / 100;
            // Reduce volatility for 3m calculation
            change3m = (pattern.base + threeMonthTrend + threeMonthMomentum + (Math.random() - 0.5) * pattern.volatility * 0.3) * 100;
        }
        
        return {
            name: manager.name,
            symbol: symbol,
            currentPrice: parseFloat(currentPrice.toFixed(2)),
            changePercent: parseFloat(ytdPercent.toFixed(2)),
            change1d: parseFloat(change1d.toFixed(2)),
            change1m: change1m !== null ? parseFloat(change1m.toFixed(2)) : null,
            change3m: change3m !== null ? parseFloat(change3m.toFixed(2)) : null,
            analysis: manager.analysis || null // Include analysis from MOCK_MANAGERS
        };
    });
    
    // Sort by YTD percentage (descending)
    results.sort((a, b) => {
        const aPercent = a.changePercent || -Infinity;
        const bPercent = b.changePercent || -Infinity;
        return bPercent - aPercent;
    });
    
    return results;
}

// Generate fake chart data - takes optional leaderboardData to ensure exact match
function generateMockChartData(leaderboardDataForSync = null) {
    // Extend mock data to show more of the year (e.g., 6 months into 2026)
    // This allows the best performing stock to reach 100%+
    const mockEndDate = new Date(2026, 5, 15); // June 15, 2026
    
    const firstTradingDay = new Date(2026, 0, 2); // Jan 2, 2026
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    
    // Generate month labels
    const monthLabels = [];
    const currentMonth = mockEndDate.getMonth();
    const currentDay = mockEndDate.getDate();
    for (let i = 0; i < currentMonth; i++) {
        monthLabels.push(months[i]);
    }
    if (currentMonth >= 0) {
        monthLabels.push(`${months[currentMonth]} ${currentDay}`);
    }
    
    // Stock patterns (same as leaderboard) - scaled up for higher amplitude
    // 2 stocks are negative: Charlie (TSLA) and Nick (PM)
    const stockPatterns = [
        { base: 0, trend: 0.75, volatility: 0.40, momentum: 0.10 },
        { base: 0, trend: 1.00, volatility: 0.75, momentum: 0.15 },
        { base: 0, trend: 0.50, volatility: 0.20, momentum: 0.05 },
        { base: 0, trend: 0.90, volatility: 0.30, momentum: 0.125 },
        { base: 0, trend: -0.20, volatility: 0.60, momentum: -0.05 }, // Charlie - TSLA (-20% annual - NEGATIVE)
        { base: 0, trend: 0.40, volatility: 0.15, momentum: 0.04 },
        { base: 0, trend: 1.10, volatility: 0.50, momentum: 0.10 },
        { base: 0, trend: 0.60, volatility: 0.25, momentum: 0.075 },
        { base: 0, trend: 0.70, volatility: 0.25, momentum: 0.09 },
        { base: 0, trend: 0.45, volatility: 0.15, momentum: 0.05 },
        { base: 0, trend: -0.15, volatility: 0.15, momentum: -0.02 }, // Nick - PM (-15% annual - NEGATIVE)
        { base: 0, trend: 0.80, volatility: 0.35, momentum: 0.10 }
    ];
    
    // Generate weekly data points (one per week, Friday close) from Jan 2, 2026 to mock end date
    // Helper function to check if a date is a trading day (weekday and not a holiday)
    const isTradingDay = (date) => {
        const day = date.getDay(); // 0 = Sunday, 6 = Saturday
        
        // Exclude weekends
        if (day === 0 || day === 6) {
            return false;
        }
        
        // Check if it's a market holiday in 2026
        const month = date.getMonth();
        const dayOfMonth = date.getDate();
        
        // 2026 US Market Holidays (NYSE/NASDAQ)
        const holidays2026 = [
            { month: 0, day: 1 },   // New Year's Day (Jan 1)
            { month: 0, day: 19 },  // Martin Luther King Jr. Day (Jan 19 - 3rd Monday)
            { month: 1, day: 16 },  // Presidents' Day (Feb 16 - 3rd Monday)
            { month: 3, day: 3 },   // Good Friday (Apr 3)
            { month: 4, day: 25 },  // Memorial Day (May 25 - last Monday)
            { month: 6, day: 3 },   // Independence Day (Jul 3 - observed, since Jul 4 is Saturday)
            { month: 8, day: 7 },   // Labor Day (Sep 7 - 1st Monday)
            { month: 10, day: 11 }, // Veterans Day (Nov 11)
            { month: 10, day: 26 }, // Thanksgiving (Nov 26 - 4th Thursday)
            { month: 11, day: 25 }  // Christmas (Dec 25)
        ];
        
        // Check if date matches any holiday
        for (const holiday of holidays2026) {
            if (holiday.month === month && holiday.day === dayOfMonth) {
                return false;
            }
        }
        
        return true;
    };
    
    const generateWeeklyData = (pattern, startDate, endDate) => {
        const data = [];
        const timestamps = [];
        
        // Start from the first trading day
        let currentDate = new Date(startDate);
        
        // Find the first trading day (skip weekends and holidays)
        while (!isTradingDay(currentDate) && currentDate <= endDate) {
            currentDate.setDate(currentDate.getDate() + 1);
        }
        
        let weekCount = 0;
        const marketCloseHour = 16;
        let tradingDayCount = 0;
        
        while (currentDate <= endDate) {
            // Only add data for trading days
            if (isTradingDay(currentDate)) {
                // Calculate actual days since start (same as leaderboard calculation)
                const daysSinceStart = Math.floor((currentDate - startDate) / (1000 * 60 * 60 * 24));
                
                // Scale to ensure best performer reaches 100%+ over full year (~252 trading days)
                // pattern.trend is now a multiplier for annual return (1.10 = 110% annual)
                // Use same calculation as leaderboard for consistency
                const tradingDaysPerYear = 252;
                const annualReturn = pattern.trend; // e.g., 1.10 = 110%
                const dailyReturn = annualReturn / tradingDaysPerYear; // Convert to daily
                const trendComponent = tradingDayCount * dailyReturn;
                const momentumComponent = tradingDayCount * pattern.momentum / 100;
                
                // Generate weekly close price - use week count for pattern
                const weekSeed = weekCount * 0.1;
                const randomFactor = (Math.sin(weekSeed) + Math.cos(weekSeed * 1.3)) * 0.3;
                let weeklyValue = (pattern.base + trendComponent + momentumComponent + randomFactor * pattern.volatility * 0.3) * 100;
                weeklyValue = parseFloat(weeklyValue.toFixed(2));
                
                const weeklyTimestamp = new Date(currentDate);
                weeklyTimestamp.setHours(marketCloseHour, 0, 0, 0);
                
                data.push(weeklyValue);
                timestamps.push(weeklyTimestamp.getTime());
                
                tradingDayCount++;
            }
            
            // Move to next day
            currentDate.setDate(currentDate.getDate() + 1);
            
            // Increment week count every 7 days (for pattern generation)
            if (currentDate.getDay() === 1) { // Monday
                weekCount++;
            }
        }
        
        return { data, timestamps };
    };
    
    // Use provided leaderboard data or generate it
    const leaderboardData = leaderboardDataForSync || generateMockLeaderboardDataForDate(mockEndDate);
    const leaderboardMap = {};
    leaderboardData.forEach(stock => {
        leaderboardMap[stock.symbol] = stock.changePercent;
    });
    
    const stockData = MOCK_MANAGERS.map((manager, index) => {
        const symbol = manager.stockSymbol;
        const pattern = stockPatterns[index] || stockPatterns[0];
        
        const { data, timestamps } = generateWeeklyData(pattern, firstTradingDay, mockEndDate);
        
        // Replace the last data point with the exact leaderboard YTD value
        if (data.length > 0 && leaderboardMap[symbol] !== undefined) {
            data[data.length - 1] = leaderboardMap[symbol];
        }
        
        return {
            name: manager.name,
            symbol: symbol,
            data: data,
            timestamps: timestamps
        };
    });
    
    return {
        months: monthLabels,
        data: stockData,
        mockEndDate: mockEndDate // Store end date for leaderboard sync
    };
}

// Generate fake leaderboard data for a specific date (to match chart end date)
function generateMockLeaderboardDataForDate(targetDate) {
    const yearStart = new Date(2026, 0, 1);
    const actualDaysSinceStart = Math.floor((targetDate - yearStart) / (1000 * 60 * 60 * 24));
    const daysSinceStart = actualDaysSinceStart < 0 ? 14 : Math.max(0, actualDaysSinceStart);
    
    // Stock patterns (matching chart patterns) - trend is now annual return multiplier
    // 2 stocks are negative: Charlie (TSLA) and Nick (PM)
    const stockPatterns = [
        { base: 0, trend: 0.75, volatility: 0.40, momentum: 0.10 },
        { base: 0, trend: 1.00, volatility: 0.75, momentum: 0.15 },
        { base: 0, trend: 0.50, volatility: 0.20, momentum: 0.05 },
        { base: 0, trend: 0.90, volatility: 0.30, momentum: 0.125 },
        { base: 0, trend: -0.20, volatility: 0.60, momentum: -0.05 }, // Charlie - TSLA (-20% annual - NEGATIVE)
        { base: 0, trend: 0.40, volatility: 0.15, momentum: 0.04 },
        { base: 0, trend: 1.10, volatility: 0.50, momentum: 0.10 },
        { base: 0, trend: 0.60, volatility: 0.25, momentum: 0.075 },
        { base: 0, trend: 0.70, volatility: 0.25, momentum: 0.09 },
        { base: 0, trend: 0.45, volatility: 0.15, momentum: 0.05 },
        { base: 0, trend: -0.15, volatility: 0.15, momentum: -0.02 }, // Nick - PM (-15% annual - NEGATIVE)
        { base: 0, trend: 0.80, volatility: 0.35, momentum: 0.10 }
    ];
    
    const results = MOCK_MANAGERS.map((manager, index) => {
        const symbol = manager.stockSymbol;
        const pattern = stockPatterns[index] || stockPatterns[0];
        
        // Calculate YTD percentage based on pattern (less random)
        // Scale to ensure best performer reaches 100%+ over full year (~252 trading days)
        const tradingDaysPerYear = 252;
        const annualReturn = pattern.trend; // e.g., 1.10 = 110%
        const dailyReturn = annualReturn / tradingDaysPerYear; // Convert to daily
        const trendComponent = daysSinceStart * dailyReturn;
        
        const momentumComponent = daysSinceStart * pattern.momentum / 100;
        // Reduce volatility by 70% for more consistent data
        const dailyVolatility = (Math.random() - 0.5) * pattern.volatility * 0.3;
        const ytdPercent = (pattern.base + trendComponent + momentumComponent + dailyVolatility) * 100;
        
        // Calculate mock prices
        const basePrice = 100;
        const currentPrice = basePrice * (1 + ytdPercent / 100);
        
        // Calculate 1d change (much smaller variation, closer to YTD)
        const change1d = ytdPercent + (Math.random() - 0.5) * 0.1;
        
        // Calculate 1m and 3m (only if enough time has passed)
        let change1m = null;
        let change3m = null;
        
        if (daysSinceStart >= 30) {
            const oneMonthTrend = Math.max(0, daysSinceStart - 30) * dailyReturn;
            const oneMonthMomentum = Math.max(0, daysSinceStart - 30) * pattern.momentum / 100;
            change1m = (pattern.base + oneMonthTrend + oneMonthMomentum + (Math.random() - 0.5) * pattern.volatility * 0.3) * 100;
        }
        
        if (daysSinceStart >= 90) {
            const threeMonthTrend = Math.max(0, daysSinceStart - 90) * dailyReturn;
            const threeMonthMomentum = Math.max(0, daysSinceStart - 90) * pattern.momentum / 100;
            change3m = (pattern.base + threeMonthTrend + threeMonthMomentum + (Math.random() - 0.5) * pattern.volatility * 0.3) * 100;
        }
        
        return {
            name: manager.name,
            symbol: symbol,
            currentPrice: parseFloat(currentPrice.toFixed(2)),
            changePercent: parseFloat(ytdPercent.toFixed(2)),
            change1d: parseFloat(change1d.toFixed(2)),
            change1m: change1m !== null ? parseFloat(change1m.toFixed(2)) : null,
            change3m: change3m !== null ? parseFloat(change3m.toFixed(2)) : null,
            analysis: manager.analysis || null // Include analysis from MOCK_MANAGERS
        };
    });
    
    // Sort by YTD percentage (descending)
    results.sort((a, b) => {
        const aPercent = a.changePercent || -Infinity;
        const bPercent = b.changePercent || -Infinity;
        return bPercent - aPercent;
    });
    
    return results;
}

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
        const useMock = new URLSearchParams(window.location.search).get('mock') === 'true';
        
        // Skip cache for mock data
        if (!useMock) {
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
        }
        
        // No valid cache, fetch from API (or generate mock data)
        await fetchLeaderboardData();
    } catch (error) {
        console.error('Error loading leaderboard:', error);
        const useMock = new URLSearchParams(window.location.search).get('mock') === 'true';
        
        // Try to use cached data even if expired (unless using mock)
        if (!useMock) {
            const cachedData = getCachedData(CACHE_KEYS.leaderboard, CACHE_KEYS.leaderboardTimestamp);
            if (cachedData) {
                console.log('Using expired cached data due to error');
                managerAnalyses = extractAnalysesFromLeaderboardData(cachedData);
                renderLeaderboard(cachedData);
                return;
            }
        }
        
        leaderboard.innerHTML = `<div class="error-message">Failed to load data. Please try again later.</div>`;
    }
}

// Shared mock data cache to ensure chart and leaderboard use exact same data
let sharedMockData = null;

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
                item.analysis !== 'Your analysis here. Explain why you picked ' + item.symbol + ' and your investment thesis in a couple of sentences.') {
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
    // Use mock data if ?mock=true is in URL
    const useMock = new URLSearchParams(window.location.search).get('mock') === 'true';
    
    if (useMock) {
        // Generate fake data directly, no API call
        // Use shared data if available, otherwise generate it
        if (!sharedMockData) {
            const chartEndDate = new Date(2026, 5, 15);
            sharedMockData = generateMockLeaderboardDataForDate(chartEndDate);
        }
        console.log('Using mock leaderboard data (no API call)');
        // Extract analyses from mock data
        managerAnalyses = extractAnalysesFromLeaderboardData(sharedMockData);
        renderLeaderboard(sharedMockData);
        return;
    }
    
    const url = `${API_BASE}/stocks/current`;
    console.log('Fetching leaderboard from API:', url);
    const response = await fetch(url);
    
    if (!response.ok) {
        const errorText = await response.text();
        console.error('Leaderboard API error:', response.status, errorText);
        throw new Error(`API error: ${response.status}`);
    }
    
    const data = await response.json();
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
        const useMock = new URLSearchParams(window.location.search).get('mock') === 'true';
        
        // Don't refresh mock data in background
        if (useMock) {
            return;
        }
        
        const url = `${API_BASE}/stocks/current`;
        const response = await fetch(url);
        if (response.ok) {
            const data = await response.json();
            setCachedData(CACHE_KEYS.leaderboard, CACHE_KEYS.leaderboardTimestamp, data);
            
            // Update leaderboard display with fresh data
            managerAnalyses = extractAnalysesFromLeaderboardData(data);
            renderLeaderboard(data);
            
            console.log('Background refresh: leaderboard data updated');
        }
    } catch (error) {
        console.log('Background refresh failed (non-critical):', error.message);
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
    
    leaderboard.innerHTML = data.map((item, index) => {
        const rank = index + 1;
        const rankClass = rank === 1 ? 'first' : rank === 2 ? 'second' : rank === 3 ? 'third' : '';
        
        const change1dClass = item.change1d !== null ? (item.change1d >= 0 ? 'positive' : 'negative') : '';
        const change1mClass = item.change1m !== null ? (item.change1m >= 0 ? 'positive' : 'negative') : '';
        const change3mClass = item.change3m !== null ? (item.change3m >= 0 ? 'positive' : 'negative') : '';
        const changeYTDClass = item.changePercent !== null ? (item.changePercent >= 0 ? 'positive' : 'negative') : '';

        // Get analysis for this manager
        // First check if analysis is directly on the item (from API), otherwise check managerAnalyses
        let analysis = null;
        if (item.analysis && typeof item.analysis === 'string' && item.analysis.trim() !== '') {
            // Analysis is directly on the item (new format from API)
            analysis = {
                stockSymbol: item.symbol,
                analysis: item.analysis
            };
        } else if (managerAnalyses[item.name]) {
            // Analysis is in managerAnalyses (extracted format)
            analysis = managerAnalyses[item.name];
        }
        
        const hasAnalysis = analysis && analysis.analysis && analysis.analysis.trim() !== '' && 
                           analysis.analysis !== 'Your analysis here. Explain why you picked ' + item.symbol + ' and your investment thesis in a couple of sentences.';
        
        
        const itemId = `leaderboard-item-${index}`;
        const analysisId = `analysis-${index}`;

        return `
            <div class="leaderboard-item ${rankClass} ${hasAnalysis ? 'clickable' : ''}" ${hasAnalysis ? `onclick="toggleAnalysis('${analysisId}')"` : ''} id="${itemId}">
                <div class="rank">${rank}</div>
                <div class="manager-info">
                    <span class="manager-name">${escapeHtml(item.name)}</span>
                    <span class="stock-symbol">${escapeHtml(item.symbol)}</span>
                    <span class="current-price">$${formatPrice(item.currentPrice)}</span>
                    <div class="time-periods mobile-only">
                        <span class="time-period">
                            <span class="period-label">1d</span>
                            <span class="period-value ${item.change1d === null ? 'no-data' : change1dClass}">${item.change1d !== null ? getChangeSign(item.change1d) + formatPercent(item.change1d) + '%' : '-'}</span>
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
                    <div class="time-periods desktop-only">
                        <span class="time-period">
                            <span class="period-label">1d</span>
                            <span class="period-value ${item.change1d === null ? 'no-data' : change1dClass}">${item.change1d !== null ? getChangeSign(item.change1d) + formatPercent(item.change1d) + '%' : '-'}</span>
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
                        <div class="analysis-text">${escapeHtml(analysis.analysis)}</div>
                    </div>
                ` : ''}
            </div>
        `;
    }).join('');
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
        
        if (analysisContent.classList.contains('expanded')) {
            analysisContent.classList.remove('expanded');
            if (leaderboardItem) {
                leaderboardItem.setAttribute('aria-expanded', 'false');
            }
        } else {
            analysisContent.classList.add('expanded');
            if (leaderboardItem) {
                leaderboardItem.setAttribute('aria-expanded', 'true');
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
    return Math.abs(Number(percent)).toFixed(2);
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Load and render performance chart
async function loadChart() {
    try {
        if (typeof Chart === 'undefined') {
            console.error('Chart.js not loaded');
            return;
        }

        // Use mock data if ?mock=true is in URL
        const useMock = new URLSearchParams(window.location.search).get('mock') === 'true';
        
        // Check cache first (unless using mock data)
        if (!useMock) {
            const cachedChartData = getCachedData(CACHE_KEYS.chart, CACHE_KEYS.chartTimestamp);
            const cachedCurrentData = getCachedData(CACHE_KEYS.leaderboard, CACHE_KEYS.leaderboardTimestamp);
            
            if (cachedChartData && cachedCurrentData) {
                console.log('Using cached chart data');
                window.lastChartData = cachedChartData;
                window.lastLeaderboardData = cachedCurrentData;
                renderChart(cachedChartData, cachedCurrentData);
                
                // Fetch fresh data in background (don't wait for it)
                fetchChartInBackground(useMock);
                return;
            }
        }
        
        // No valid cache, fetch from API
        await fetchChartData(useMock);
    } catch (error) {
        console.error('Error loading chart:', error);
        // Try to use cached data even if expired
        const cachedChartData = getCachedData(CACHE_KEYS.chart, CACHE_KEYS.chartTimestamp);
        const cachedCurrentData = getCachedData(CACHE_KEYS.leaderboard, CACHE_KEYS.leaderboardTimestamp);
        
        if (cachedChartData && cachedCurrentData) {
            console.log('Using expired cached data due to error');
            window.lastChartData = cachedChartData;
            window.lastLeaderboardData = cachedCurrentData;
            renderChart(cachedChartData, cachedCurrentData);
        }
    }
}

async function fetchChartData(useMock) {
    if (useMock) {
        // Generate fake data directly, no API call
        console.log('Using mock chart data (no API call)');
        // Use shared data - generate if not already created
        if (!sharedMockData) {
            const endDate = new Date(2026, 5, 15);
            sharedMockData = generateMockLeaderboardDataForDate(endDate);
        }
        const chartData = generateMockChartData(sharedMockData);
        window.lastChartData = chartData;
        window.lastLeaderboardData = sharedMockData;
        renderChart(chartData, sharedMockData);
        return;
    }
    
    const url = `${API_BASE}/stocks/monthly`;
    console.log('Fetching chart data from API:', url);
    
    const response = await fetch(url);
    
    if (!response.ok) {
        const errorText = await response.text();
        console.error('Chart API error:', response.status, errorText);
        throw new Error(`API error: ${response.status}`);
    }
    
    const chartData = await response.json();
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
    
    // Render the chart
    renderChart(chartData, currentData);
}

async function fetchChartInBackground(useMock) {
    // Silently fetch fresh data in background
    try {
        // Don't refresh mock data in background
        if (useMock) {
            return;
        }
        
        const url = `${API_BASE}/stocks/monthly`;
        const response = await fetch(url);
        if (response.ok) {
            const chartData = await response.json();
            const currentResponse = await fetch(`${API_BASE}/stocks/current`);
            if (currentResponse.ok) {
                const currentData = await currentResponse.json();
                if (!useMock) {
                    setCachedData(CACHE_KEYS.chart, CACHE_KEYS.chartTimestamp, chartData);
                    setCachedData(CACHE_KEYS.leaderboard, CACHE_KEYS.leaderboardTimestamp, currentData);
                    
                    // Update leaderboard display with fresh data
                    managerAnalyses = extractAnalysesFromLeaderboardData(currentData);
                    renderLeaderboard(currentData);
                    
                    // Re-render chart with fresh data
                    window.lastChartData = chartData;
                    window.lastLeaderboardData = currentData;
                    renderChart(chartData, currentData);
                    
                    console.log('Background refresh: chart and leaderboard data updated');
                }
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
    const maxDataPoints = Math.max(...chartData.data.map(d => (d.data || []).length));
    
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
            // Check if this is mock data and adjust accordingly
            const useMock = new URLSearchParams(window.location.search).get('mock') === 'true';
            
            if (useMock && lastMonthName === 'Jul') {
                // For mock data in July, space the daily points to cover up to July 17
                const targetLastDay = 17; // Mock data goes up to July 17
                const step = (targetLastDay - 1) / (dailyDataCount - 1);
                
                for (let i = 0; i < dailyDataCount; i++) {
                    const day = Math.round(1 + (i * step));
                    const date = new Date(currentYear, lastMonthIndex, Math.min(day, targetLastDay));
                    if (!isNaN(date.getTime())) {
                        dates.push(date);
                    }
                }
            } else {
                // For real data, start from the first trading day of the month
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
    // Also add dates from the dates array if they're not already included (but only up to today)
    dates.forEach(date => {
        const ts = date.getTime();
        if (ts >= firstTradingDay.getTime() && ts <= todayTimestamp && !allUniqueTimestamps.includes(ts)) {
            allUniqueTimestamps.push(ts);
        }
    });
    // Sort timestamps and create index mapping (only up to today)
    allUniqueTimestamps.sort((a, b) => a - b);
    // Filter out future timestamps before creating the mapping
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
    
    // Calculate min and max trading day indices (for linear scale)
    let minIndex = 0;
    let maxIndex = 0;
    
    if (validDatasets.length > 0 && validDatasets[0].data.length > 0) {
        // Find min/max indices from all valid datasets
        const allIndices = [];
        validDatasets.forEach(dataset => {
            if (dataset.data && dataset.data.length > 0) {
                dataset.data.forEach(point => {
                    if (point.x !== null && point.x !== undefined) {
                        allIndices.push(point.x);
                    }
                });
            }
        });
        
        if (allIndices.length > 0) {
            minIndex = Math.min(...allIndices);
            maxIndex = Math.max(...allIndices);
        }
    }
    
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
                        align: 'center',
                        fullSize: true,
                        color: currentTheme === 'dark' ? 'rgba(255, 255, 255, 0.8)' : '#666666',
                        font: {
                            size: isMobile ? 10 : 12,
                            weight: '500',
                            family: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen, Ubuntu, Cantarell, "Helvetica Neue", sans-serif'
                        },
                        padding: {
                            top: 0,
                            bottom: isMobile ? 8 : 12
                        }
                    },
                    legend: {
                        display: false
                    },
                    tooltip: {
                        enabled: false
                    },
                    interaction: {
                        intersect: false,
                        mode: 'nearest'
                    }
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
                                return sign + value.toFixed(1) + '%';
                            },
                            color: currentTheme === 'dark' ? 'rgba(255, 255, 255, 0.6)' : '#666666',
                            font: {
                                size: isMobile ? 10 : 12,
                                weight: '500'
                            },
                            padding: isMobile ? 4 : 8
                        },
                        grid: {
                            color: currentTheme === 'dark' ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.08)',
                            borderColor: currentTheme === 'dark' ? 'rgba(255, 255, 255, 0.12)' : '#d0d0d0',
                            lineWidth: 1,
                            drawBorder: true,
                            zeroLineColor: currentTheme === 'dark' ? 'rgba(255, 255, 255, 0.15)' : 'rgba(0, 0, 0, 0.2)',
                            zeroLineWidth: 2
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
                            display: true,
                            color: currentTheme === 'dark' ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.05)',
                            drawOnChartArea: true
                        },
                        ticks: {
                            display: true,
                            maxTicksLimit: isMobile ? 6 : 8, // Increased for mobile to ensure last date shows
                            autoSkip: true,
                            autoSkipPadding: 10,
                            color: currentTheme === 'dark' ? 'rgba(255, 255, 255, 0.6)' : '#666666',
                            font: {
                                size: isMobile ? 10 : 12,
                                weight: '500'
                            },
                            maxRotation: isMobile ? 45 : 0,
                            minRotation: 0,
                            padding: isMobile ? 8 : 12,
                            // Map trading day indices to date labels
                            callback: function(value, index, ticks) {
                                if (value === null || value === undefined) {
                                    return '';
                                }
                                const tradingDayIndex = Math.round(value);
                                let label = indexToDateLabel.get(tradingDayIndex);
                                
                                // On mobile, always show the last tick (current date) even if it's not in the normal tick sequence
                                if (isMobile && index === ticks.length - 1) {
                                    // Find the last available label (max index) to ensure current date is shown
                                    let maxIdx = -1;
                                    let lastLabel = '';
                                    indexToDateLabel.forEach((lbl, idx) => {
                                        if (idx > maxIdx) {
                                            maxIdx = idx;
                                            lastLabel = lbl;
                                        }
                                    });
                                    // If the current tick is not the last date, return the last date instead
                                    if (tradingDayIndex < maxIdx && lastLabel) {
                                        return lastLabel;
                                    }
                                }
                                
                                return label || '';
                            },
                            // Force the last tick to always be at max index on mobile
                            stepSize: isMobile ? undefined : undefined, // Let autoSkip handle it
                            // Custom function to ensure last tick is included
                            afterBuildTicks: function(scale) {
                                if (isMobile && scale.ticks && scale.ticks.length > 0) {
                                    // Get the max index
                                    const maxIdx = Math.max(...Array.from(indexToDateLabel.keys()));
                                    const lastTick = scale.ticks[scale.ticks.length - 1];
                                    
                                    // If the last tick is not at max index, replace it
                                    if (lastTick && Math.round(lastTick.value) < maxIdx) {
                                        const lastLabel = indexToDateLabel.get(maxIdx);
                                        if (lastLabel) {
                                            lastTick.value = maxIdx;
                                            lastTick.label = lastLabel;
                                        }
                                    }
                                }
                            }
                        }
                    }
                },
                layout: {
                    padding: {
                        right: isMobile ? 30 : 120,
                        left: isMobile ? 10 : 20,
                        top: isMobile ? 10 : 20,
                        bottom: isMobile ? 10 : 20
                    }
                },
                elements: {
                    point: {
                        hoverRadius: 8,
                        hoverBorderWidth: 3
                    }
                }
            },
            plugins: [{
                id: 'lineLabels',
                afterDatasetsDraw: (chart) => {
                    const ctx = chart.ctx;
                    const chartArea = chart.chartArea;
                    if (!chartArea) {
                        console.warn('Chart area not available');
                        return;
                    }
                    
                    console.log('=== LABEL RENDERING DEBUG ===');
                    console.log('Chart area:', chartArea);
                    console.log('Datasets count:', chart.data.datasets.length);
                    
                    const isMobile = window.innerWidth < 768;
                    console.log('Is mobile:', isMobile);
                    const config = {
                        mobile: {
                            fontSize: '600 8px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                            textHeight: 9,
                            labelOffsetX: 4,
                            padding: 35,
                            minSpacing: 3,
                            topMargin: 5,
                            bottomMargin: 5,
                            topBound: 20,
                            bottomBound: 20,
                            labelTopMargin: 5,
                            labelBottomMargin: 5,
                            lineWidth: 1.5,
                            rectPadding: 3,
                            rectHeightOffset: 4
                        },
                        desktop: {
                            fontSize: '600 13px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                            textHeight: 18,
                            labelOffsetX: 14,
                            padding: 20,
                            minSpacing: 3,
                            topMargin: 10,
                            bottomMargin: 10,
                            topBound: 20,
                            bottomBound: 20,
                            labelTopMargin: 15,
                            labelBottomMargin: 15,
                            lineWidth: 2,
                            rectPadding: 8,
                            rectHeightOffset: 4
                        }
                    };
                    
                    const cfg = isMobile ? config.mobile : config.desktop;
                    const labelData = [];
                    ctx.font = cfg.fontSize;
                    ctx.textAlign = 'left';
                    ctx.textBaseline = 'middle';
                    
                    chart.data.datasets.forEach((dataset, datasetIndex) => {
                        const meta = chart.getDatasetMeta(datasetIndex);
                        if (!meta || meta.hidden || !meta.data || meta.data.length === 0) {
                            console.log(`Dataset ${datasetIndex} skipped: hidden=${meta?.hidden}, data length=${meta?.data?.length}`);
                            return;
                        }
                        
                        const lastPoint = meta.data[meta.data.length - 1];
                        const value = dataset.data[dataset.data.length - 1];
                        
                        console.log(`Dataset ${datasetIndex} (${dataset.label}):`, {
                            lastPoint: lastPoint ? { x: lastPoint.x, y: lastPoint.y } : 'null',
                            value: value,
                            dataLength: dataset.data.length
                        });
                        
                        if (value === null || lastPoint === undefined || lastPoint.x === undefined || lastPoint.y === undefined) {
                            console.log(`Dataset ${datasetIndex} skipped: invalid point or value`);
                            return;
                        }
                        
                        const x = lastPoint.x;
                        // Use the Y value from the last point (which should be the leaderboard YTD)
                        // But prefer leaderboard YTD if available to ensure exact match
                        const y = lastPoint.y;
                        
                        // Get YTD percentage from current stock data (same source as leaderboard)
                        const labelParts = dataset.label.split(' (');
                        const name = labelParts[0] || '';
                        const symbol = labelParts[1] ? labelParts[1].replace(')', '') : '';
                        
                        // Always use YTD from leaderboard to ensure exact match
                        const ytdPercent = ytdMap[symbol] !== undefined ? ytdMap[symbol] : (y !== null && y !== undefined ? y : null);
                        const ytdFormatted = ytdPercent !== null && ytdPercent !== undefined 
                            ? `${ytdPercent >= 0 ? '+' : ''}${ytdPercent.toFixed(1)}%`
                            : 'N/A';
                        
                        // Format: "Name • SYMBOL • +12.5%" for both desktop and mobile
                        const labelText = `${name} • ${symbol} • ${ytdFormatted}`;
                        
                        ctx.font = cfg.fontSize;
                        const textMetrics = ctx.measureText(labelText);
                        const maxWidth = textMetrics.width;
                        
                        console.log(`Adding label for dataset ${datasetIndex}:`, labelText, 'at point:', { x, y });
                        
                        labelData.push({
                            datasetIndex,
                            x: x + cfg.labelOffsetX,
                            y: y,
                            textWidth: maxWidth,
                            textHeight: cfg.textHeight,
                            labelText,
                            color: dataset.borderColor,
                            originalY: y,
                            originalX: x,
                            pointX: x,
                            pointY: y,
                            ytdValue: ytdPercent !== null && ytdPercent !== undefined ? ytdPercent : (value !== null && value !== undefined ? value : 0)
                        });
                    });
                    
                    console.log(`Collected ${labelData.length} labels`);
                    
                    // Sort labels by YTD percentage value (highest to lowest, top to bottom)
                    // This ensures labels are ordered correctly by their actual performance
                    labelData.sort((a, b) => b.ytdValue - a.ytdValue);
                    const minSpacing = cfg.minSpacing;
                    const topBound = chartArea.top + cfg.labelTopMargin;
                    const bottomBound = chartArea.bottom - cfg.labelBottomMargin;
                    
                    // Enhanced collision detection - resolve all overlaps with more aggressive spacing
                    let hasOverlaps = true;
                    let iterations = 0;
                    const maxIterations = 100; // Increased for better resolution
                    
                    while (hasOverlaps && iterations < maxIterations) {
                        iterations++;
                        hasOverlaps = false;
                        
                        // Sort by Y position for ordered processing
                        labelData.sort((a, b) => a.y - b.y);
                        
                        // Check all pairs of labels for overlaps
                        for (let i = 0; i < labelData.length; i++) {
                            const current = labelData[i];
                            const currentTop = current.y - current.textHeight / 2;
                            const currentBottom = current.y + current.textHeight / 2;
                            
                            for (let j = i + 1; j < labelData.length; j++) {
                                const other = labelData[j];
                                const otherTop = other.y - other.textHeight / 2;
                                const otherBottom = other.y + other.textHeight / 2;
                                
                                // Check if labels overlap - calculate gap between them
                                // If current is above other, gap = otherTop - currentBottom
                                // If other is above current, gap = currentTop - otherBottom
                                const gap = current.y < other.y 
                                    ? (otherTop - currentBottom) 
                                    : (currentTop - otherBottom);
                                
                                // Only adjust if labels are overlapping or touching (gap < minSpacing)
                                if (gap < minSpacing) {
                                    hasOverlaps = true;
                                    
                                    // Calculate required separation - just enough to prevent overlap
                                    const totalNeeded = minSpacing - gap;
                                    
                                    // Determine movement direction based on YTD values (higher YTD should be above)
                                    const currentIsAbove = current.ytdValue > other.ytdValue;
                                    
                                    if (currentIsAbove) {
                                        // Current should be above, move it up or other down
                                        if (current.y - totalNeeded - current.textHeight / 2 >= topBound) {
                                            current.y -= totalNeeded;
                                        } else if (other.y + totalNeeded + other.textHeight / 2 <= bottomBound) {
                                            other.y += totalNeeded;
                                        } else {
                                            // Split the difference
                                            const moveAmount = totalNeeded / 2;
                                            current.y = Math.max(topBound + current.textHeight / 2, current.y - moveAmount);
                                            other.y = Math.min(bottomBound - other.textHeight / 2, other.y + moveAmount);
                                        }
                                    } else {
                                        // Other should be above, move it up or current down
                                        if (other.y - totalNeeded - other.textHeight / 2 >= topBound) {
                                            other.y -= totalNeeded;
                                        } else if (current.y + totalNeeded + current.textHeight / 2 <= bottomBound) {
                                            current.y += totalNeeded;
                                        } else {
                                            // Split the difference
                                            const moveAmount = totalNeeded / 2;
                                            other.y = Math.max(topBound + other.textHeight / 2, other.y - moveAmount);
                                            current.y = Math.min(bottomBound - current.textHeight / 2, current.y + moveAmount);
                                        }
                                    }
                                }
                            }
                            
                            // Ensure label is within bounds after adjustments
                            if (current.y - current.textHeight / 2 < topBound) {
                                current.y = topBound + current.textHeight / 2;
                            }
                            if (current.y + current.textHeight / 2 > bottomBound) {
                                current.y = bottomBound - current.textHeight / 2;
                            }
                        }
                    }
                    
                    // Final pass: ensure no overlaps and maintain correct order by YTD value
                    // Sort by YTD value (highest to lowest) to maintain performance order
                    labelData.sort((a, b) => b.ytdValue - a.ytdValue);
                    
                    // Multiple passes to ensure all overlaps are resolved
                    for (let pass = 0; pass < 5; pass++) {
                        for (let i = 1; i < labelData.length; i++) {
                            const current = labelData[i];
                            const previous = labelData[i - 1];
                            
                            // Previous should be above current (higher YTD = higher on chart)
                            const currentTop = current.y - current.textHeight / 2;
                            const previousBottom = previous.y + previous.textHeight / 2;
                            const gap = currentTop - previousBottom;
                            
                            // If overlapping or too close, separate them
                            if (gap < minSpacing) {
                                const needed = minSpacing - gap;
                                
                                // Try to move current down (lower YTD goes down)
                                if (current.y + needed + current.textHeight / 2 <= bottomBound) {
                                    current.y += needed;
                                } else if (previous.y - needed - previous.textHeight / 2 >= topBound) {
                                    // Move previous up (higher YTD goes up)
                                    previous.y -= needed;
                                } else {
                                    // Split the difference if both are constrained
                                    const moveAmount = needed / 2;
                                    current.y = Math.min(bottomBound - current.textHeight / 2, current.y + moveAmount);
                                    previous.y = Math.max(topBound + previous.textHeight / 2, previous.y - moveAmount);
                                }
                            }
                            
                            // Ensure previous is always above current (maintain YTD order)
                            if (previous.ytdValue > current.ytdValue && previous.y >= current.y) {
                                // Previous should be above, ensure proper spacing
                                const requiredY = previous.y + previous.textHeight / 2 + minSpacing + current.textHeight / 2;
                                if (requiredY <= bottomBound) {
                                    current.y = requiredY;
                                } else {
                                    // Can't fit below, move previous up
                                    const newPreviousY = current.y - current.textHeight / 2 - minSpacing - previous.textHeight / 2;
                                    if (newPreviousY >= topBound) {
                                        previous.y = newPreviousY;
                                    } else {
                                        // Both constrained, split the difference
                                        const midY = (topBound + bottomBound) / 2;
                                        previous.y = midY - (previous.textHeight + minSpacing) / 2;
                                        current.y = midY + (current.textHeight + minSpacing) / 2;
                                    }
                                }
                            }
                            
                            // Clamp both to bounds after each adjustment
                            previous.y = Math.max(topBound + previous.textHeight / 2, Math.min(bottomBound - previous.textHeight / 2, previous.y));
                            current.y = Math.max(topBound + current.textHeight / 2, Math.min(bottomBound - current.textHeight / 2, current.y));
                        }
                    }
                    
                    // Final verification pass: check all pairs one more time to ensure no overlaps
                    labelData.sort((a, b) => a.y - b.y);
                    for (let i = 0; i < labelData.length; i++) {
                        for (let j = i + 1; j < labelData.length; j++) {
                            const label1 = labelData[i];
                            const label2 = labelData[j];
                            
                            const label1Top = label1.y - label1.textHeight / 2;
                            const label1Bottom = label1.y + label1.textHeight / 2;
                            const label2Top = label2.y - label2.textHeight / 2;
                            const label2Bottom = label2.y + label2.textHeight / 2;
                            
                            // Calculate gap
                            const gap = label1.y < label2.y 
                                ? (label2Top - label1Bottom) 
                                : (label1Top - label2Bottom);
                            
                            // If still overlapping, force separation
                            if (gap < minSpacing) {
                                const needed = minSpacing - gap;
                                if (label1.y < label2.y) {
                                    // label1 is above, move label2 down
                                    label2.y += needed;
                                    label2.y = Math.min(bottomBound - label2.textHeight / 2, label2.y);
                                } else {
                                    // label2 is above, move label1 down
                                    label1.y += needed;
                                    label1.y = Math.min(bottomBound - label1.textHeight / 2, label1.y);
                                }
                            }
                        }
                    }
                    
                    let drawnCount = 0;
                    labelData.forEach((label) => {
                        // Always draw labels - don't filter by bounds
                        ctx.save();
                        ctx.font = cfg.fontSize;
                        ctx.textAlign = 'left';
                        ctx.textBaseline = 'middle';
                        
                        // Always position label to the right of the point
                        let finalLabelX = label.x;
                        
                        // Check if label would go off the right edge
                        const labelRightEdge = finalLabelX + label.textWidth + cfg.rectPadding * 2;
                        const maxX = chartArea.right - 5; // 5px margin from edge
                        
                        if (labelRightEdge > maxX) {
                            // Move label left to fit on screen
                            finalLabelX = maxX - label.textWidth - cfg.rectPadding * 2;
                        }
                        
                        ctx.textAlign = 'left';
                        
                        // Use the adjusted Y position (already clamped during collision detection)
                        // Final safety check to ensure label is visible
                        const topBound = chartArea.top + label.textHeight / 2 + cfg.labelTopMargin;
                        const bottomBound = chartArea.bottom - label.textHeight / 2 - cfg.labelBottomMargin;
                        const finalLabelY = Math.max(topBound, Math.min(bottomBound, label.y));
                        
                        // Update label Y if it was clamped for consistency
                        label.y = finalLabelY;
                        
                        console.log(`Drawing label ${label.datasetIndex} (${label.labelText}) at:`, {
                            x: finalLabelX,
                            y: finalLabelY,
                            chartArea: chartArea
                        });
                        
                        // Draw background rectangle with rounded corners
                        // Adjust rectX based on text alignment
                        const rectX = ctx.textAlign === 'right' 
                            ? finalLabelX - label.textWidth - cfg.rectPadding
                            : finalLabelX - cfg.rectPadding;
                        const rectY = finalLabelY - label.textHeight / 2 - 2;
                        const rectWidth = label.textWidth + cfg.rectPadding * 2;
                        const rectHeight = label.textHeight + cfg.rectHeightOffset;
                        const borderRadius = isMobile ? 4 : 6;
                        
                        // Get current theme for label styling
                        const labelTheme = document.documentElement.getAttribute('data-theme') || 'light';
                        
                        // Draw rounded rectangle background - theme-aware
                        ctx.fillStyle = labelTheme === 'dark' ? '#000000' : 'rgba(255, 255, 255, 0.95)';
                        ctx.beginPath();
                        ctx.roundRect(rectX, rectY, rectWidth, rectHeight, borderRadius);
                        ctx.fill();
                        
                        // Draw border
                        ctx.strokeStyle = label.color;
                        ctx.lineWidth = cfg.lineWidth;
                        ctx.stroke();
                        
                        // Draw label text with better styling - theme-aware
                        ctx.fillStyle = labelTheme === 'dark' ? '#ffffff' : '#1a1a1a';
                        ctx.shadowColor = labelTheme === 'dark' ? 'rgba(0, 0, 0, 0.3)' : 'rgba(0, 0, 0, 0.05)';
                        ctx.shadowBlur = 1;
                        ctx.shadowOffsetX = 0;
                        ctx.shadowOffsetY = 0.5;
                        
                        // Draw single line label (same format for desktop and mobile)
                        ctx.fillText(label.labelText, finalLabelX, finalLabelY);
                        ctx.shadowBlur = 0; // Reset shadow
                        ctx.restore();
                        
                        drawnCount++;
                    });
                    
                    console.log(`Drew ${drawnCount} labels out of ${labelData.length} collected`);
                    console.log('=== END LABEL DEBUG ===');
                }
            }]
        });
}

// Handle window resize
window.addEventListener('resize', () => {
    if (performanceChart) {
        const container = document.getElementById('performanceChart');
        if (container) {
            performanceChart.applyOptions({ width: container.clientWidth, height: container.clientHeight });
        }
    }
});

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

// Auto-refresh every 15 minutes to avoid rate limits
setInterval(() => {
    if (isMarketOpen()) {
        // Market hours: refresh every 15 minutes
        loadLeaderboard();
        loadIndexes();
        loadChart();
    }
}, 900000); // 15 minutes (900,000 milliseconds)

// Load Indexes
async function loadIndexes() {
    try {
        const useMock = new URLSearchParams(window.location.search).get('mock') === 'true';
        
        // Generate mock index data for testing or fallback
        const mockData = [
            {
                symbol: 'SPY',
                name: 'S&P 500',
                currentPrice: 485.23,
                changePercent: 12.45,
                change1d: 0.23
            },
            {
                symbol: 'QQQ',
                name: 'Nasdaq 100',
                currentPrice: 432.18,
                changePercent: 15.67,
                change1d: 0.45
            },
            {
                symbol: 'DIA',
                name: 'Dow Jones',
                currentPrice: 385.42,
                changePercent: 10.23,
                change1d: 0.18
            },
            {
                symbol: 'DX-Y.NYB',
                name: 'US Dollar',
                currentPrice: 104.32,
                changePercent: -2.15,
                change1d: -0.12
            }
        ];
        
        if (useMock) {
            renderIndexes(mockData);
            return;
        }
        
        const url = `${API_BASE}/indexes`;
        const response = await fetch(url);
        
        if (!response.ok) {
            console.warn('Index API failed, using mock data');
            renderIndexes(mockData);
            return;
        }
        
        const data = await response.json();
        
        // Log the data we received for debugging
        console.log('Index data received from API:', data);
        
        // If we got empty data or all null values, gracefully fall back to mock data
        if (!data || data.length === 0 || data.every(d => d.changePercent === null)) {
            console.warn('Index API returned no valid data, using mock data fallback');
            renderIndexes(mockData);
            return;
        }
        
        renderIndexes(data);
    } catch (error) {
        console.error('Error loading indexes:', error);
        // Show error instead of mock data
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

// Initial load
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        loadLeaderboard();
        loadIndexes();
        setTimeout(loadChart, 100);
    });
} else {
    loadLeaderboard();
    loadIndexes();
    setTimeout(loadChart, 100);
}

