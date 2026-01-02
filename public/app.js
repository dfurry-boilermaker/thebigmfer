const API_BASE = '/api';

// DOM Elements
const leaderboard = document.getElementById('leaderboard');
let performanceChart = null;

// Load Leaderboard
async function loadLeaderboard() {
    try {
        console.log('Loading leaderboard from:', `${API_BASE}/stocks/current`);
        const response = await fetch(`${API_BASE}/stocks/current`);
        
        if (!response.ok) {
            const errorText = await response.text();
            console.error('Leaderboard API error:', response.status, errorText);
            leaderboard.innerHTML = `<div class="error-message">Error ${response.status}: ${errorText || 'Failed to load data'}</div>`;
            return;
        }
        
        const data = await response.json();
        console.log('Leaderboard data received:', data.length, 'items');
        
        if (!data || data.length === 0) {
            console.warn('No data received from API');
            leaderboard.innerHTML = `
                <div class="empty-state">
                    <p>No managers found.</p>
                </div>
            `;
            return;
        }
        
        leaderboard.innerHTML = data.map((item, index) => {
            const rank = index + 1;
            const rankClass = rank === 1 ? 'first' : rank === 2 ? 'second' : rank === 3 ? 'third' : '';
            
            const change1dClass = item.change1d !== null ? (item.change1d >= 0 ? 'positive' : 'negative') : '';
            const change1mClass = item.change1m !== null ? (item.change1m >= 0 ? 'positive' : 'negative') : '';
            const change3mClass = item.change3m !== null ? (item.change3m >= 0 ? 'positive' : 'negative') : '';
            const changeYTDClass = item.changePercent !== null ? (item.changePercent >= 0 ? 'positive' : 'negative') : '';

            return `
                <div class="leaderboard-item ${rankClass}">
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
                </div>
            `;
        }).join('');
    } catch (error) {
        leaderboard.innerHTML = `<div class="error-message">Error loading leaderboard: ${error.message}</div>`;
    }
}

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
        const url = `${API_BASE}/stocks/monthly${useMock ? '?mock=true' : ''}`;
        console.log('Loading chart data from:', url);
        
        const response = await fetch(url);
        
        if (!response.ok) {
            const errorText = await response.text();
            console.error('Chart API error:', response.status, errorText);
            return;
        }
        
        const chartData = await response.json();
        console.log('Chart data received:', chartData);
        
        // Fetch current stock data to get accurate YTD percentages
        const currentResponse = await fetch(`${API_BASE}/stocks/current`);
        const currentData = await currentResponse.json();
        
        // Create a map of symbol to YTD percentage for quick lookup
        const ytdMap = {};
        if (currentData && Array.isArray(currentData)) {
            currentData.forEach(stock => {
                ytdMap[stock.symbol] = stock.changePercent;
            });
        }
        
        const ctx = document.getElementById('performanceChart');
        if (!ctx) return;

        if (performanceChart) {
            performanceChart.destroy();
        }

        // Enhanced colors with better contrast and visibility
        const colors = [
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
                // We have enough labels, use them directly
                for (let i = 0; i < datesNeeded; i++) {
                    const { monthIndex, day } = parseLabel(labels[i]);
                    if (monthIndex !== -1 && day !== null) {
                        dates.push(new Date(currentYear, monthIndex, day));
                    }
                }
            } else {
                // We have fewer labels than needed, use labels and fill remaining
                for (let i = 0; i < labels.length; i++) {
                    const { monthIndex, day } = parseLabel(labels[i]);
                    if (monthIndex !== -1 && day !== null) {
                        dates.push(new Date(currentYear, monthIndex, day));
                    }
                }
                // Fill remaining dates sequentially from last label
                if (labels.length > 0) {
                    const lastLabel = parseLabel(labels[labels.length - 1]);
                    if (lastLabel.monthIndex !== -1 && lastLabel.day !== null) {
                        let currentDate = new Date(currentYear, lastLabel.monthIndex, lastLabel.day);
                        while (dates.length < maxDataPoints) {
                            currentDate.setDate(currentDate.getDate() + 1);
                            // Skip weekends
                            if (currentDate.getDay() !== 0 && currentDate.getDay() !== 6) {
                                dates.push(new Date(currentDate));
                            }
                        }
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
            if (dailyDataCount > 0 && labels.length > 0) {
                if (lastMonthIndex !== -1) {
                    // Check if this is mock data and adjust accordingly
                    const useMock = new URLSearchParams(window.location.search).get('mock') === 'true';
                    
                    if (useMock && lastMonthName === 'Jul') {
                        // For mock data in July, space the daily points to cover up to July 17
                        const targetLastDay = 17; // Mock data goes up to July 17
                        const step = (targetLastDay - 1) / (dailyDataCount - 1);
                        
                        for (let i = 0; i < dailyDataCount; i++) {
                            const day = Math.round(1 + (i * step));
                            dates.push(new Date(currentYear, lastMonthIndex, Math.min(day, targetLastDay)));
                        }
                    } else {
                        // For real data, start from the first trading day of the month
                        // Jan 1, 2026 is a holiday, so first trading day is Jan 2
                        const firstTradingDay = (lastMonthIndex === 0 && currentYear === 2026) ? 2 : 1;
                        for (let i = 0; i < dailyDataCount; i++) {
                            dates.push(new Date(currentYear, lastMonthIndex, firstTradingDay + i));
                        }
                    }
                }
            }
        }
        
        // Ensure we have dates for all data points
        while (dates.length < maxDataPoints) {
            const lastDate = new Date(dates[dates.length - 1]);
            lastDate.setDate(lastDate.getDate() + 1);
            dates.push(lastDate);
        }
        
        // Trim to exact number of data points
        if (dates.length > maxDataPoints) {
            dates.length = maxDataPoints;
        }
        
        // Debug: log date calculation
        console.log('Date calculation:', {
            maxDataPoints,
            datesCount: dates.length,
            firstDate: dates[0]?.toISOString(),
            lastDate: dates[dates.length - 1]?.toISOString(),
            labels,
            hasSpecificDays,
            dates: dates.map(d => d.toISOString().split('T')[0])
        });
        
        // Ensure we have exactly maxDataPoints dates
        if (dates.length !== maxDataPoints) {
            console.warn(`Date count mismatch: expected ${maxDataPoints}, got ${dates.length}`);
            // Fill or trim to match
            while (dates.length < maxDataPoints) {
                const lastDate = new Date(dates[dates.length - 1]);
                lastDate.setDate(lastDate.getDate() + 1);
                dates.push(lastDate);
            }
            if (dates.length > maxDataPoints) {
                dates.length = maxDataPoints;
            }
        }
        
        const datasets = chartData.data.map((stock, index) => {
            const color = colors[index % colors.length];
            const data = stock.data || [];
            const timestamps = stock.timestamps || [];
            
            // Get the symbol to look up current YTD
            const symbol = stock.symbol;
            const currentYTD = ytdMap[symbol];
            
            // Use timestamps from API if available, otherwise fall back to calculated dates
            const timeData = data.map((value, idx) => {
                let timestamp;
                if (timestamps.length > idx && timestamps[idx]) {
                    timestamp = timestamps[idx];
                } else {
                    const date = dates[idx] || dates[0] || firstTradingDay;
                    timestamp = date.getTime();
                }
                
                // For the last data point, use current YTD if available to ensure accuracy
                let yValue = value;
                if (idx === data.length - 1 && currentYTD !== null && currentYTD !== undefined) {
                    yValue = currentYTD;
                }
                
                return {
                    x: timestamp,
                    y: yValue
                };
            });
            
            // Calculate adaptive tension based on data density
            // More data points = smoother lines (lower tension)
            // Fewer data points = more responsive (higher tension)
            let adaptiveTension = 0.1; // Default - smoother
            if (timeData.length > 0) {
                const timeSpan = timeData[timeData.length - 1].x - timeData[0].x;
                const dataPointsPerDay = timeData.length / (timeSpan / (1000 * 60 * 60 * 24));
                
                // Adjust tension based on data density (lower values = smoother)
                if (dataPointsPerDay > 6) {
                    // High density (hourly data) - very smooth
                    adaptiveTension = 0.05;
                } else if (dataPointsPerDay > 1) {
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

        // Calculate min and max dates for the time scale
        // Start from Jan 2, 2026 (first trading day)
        let minDate = new Date(2026, 0, 2).getTime(); // Jan 2, 2026
        let maxDate = new Date(2026, 11, 31).getTime();
        
        if (datasets.length > 0 && datasets[0].data.length > 0) {
            // Find min/max from all datasets
            const allTimestamps = [];
            datasets.forEach(dataset => {
                if (dataset.data && dataset.data.length > 0) {
                    dataset.data.forEach(point => {
                        if (point.x) allTimestamps.push(point.x);
                    });
                }
            });
            
            if (allTimestamps.length > 0) {
                minDate = Math.min(...allTimestamps);
                maxDate = Math.max(...allTimestamps);
            }
        } else if (dates.length > 0) {
            // Fallback to calculated dates
            minDate = dates[0] ? dates[0].getTime() : new Date(2025, 11, 31).getTime();
            maxDate = dates[dates.length - 1] ? dates[dates.length - 1].getTime() : new Date(2026, 11, 31).getTime();
        }
        
        // Validate data before creating chart
        if (!datasets || datasets.length === 0) {
            console.error('No datasets to display');
            return;
        }
        
        if (datasets.some(d => !d.data || d.data.length === 0)) {
            console.error('Some datasets have no data');
            return;
        }
        
        console.log('Creating chart with:', {
            datasetsCount: datasets.length,
            dataPointsPerDataset: datasets[0].data.length,
            minDate: new Date(minDate).toISOString(),
            maxDate: new Date(maxDate).toISOString()
        });

        performanceChart = new Chart(ctx, {
            type: 'line',
            data: {
                datasets: datasets
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
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
                            color: '#666666',
                            font: {
                                size: isMobile ? 10 : 12,
                                weight: '500'
                            },
                            padding: isMobile ? 4 : 8
                        },
                        grid: {
                            color: 'rgba(0, 0, 0, 0.08)',
                            borderColor: '#d0d0d0',
                            lineWidth: 1,
                            drawBorder: true,
                            zeroLineColor: 'rgba(0, 0, 0, 0.2)',
                            zeroLineWidth: 2
                        }
                    },
                    x: {
                        type: 'time',
                        time: {
                            unit: 'day',
                            displayFormats: {
                                day: 'MMM d'
                            },
                            tooltipFormat: 'MMM d, yyyy'
                        },
                        min: minDate,
                        max: maxDate,
                        position: 'bottom',
                        title: {
                            display: false
                        },
                        display: true,
                        grid: {
                            display: true,
                            color: 'rgba(0, 0, 0, 0.05)',
                            drawOnChartArea: true
                        },
                        adapters: {
                            date: {
                                locale: 'en-US'
                            }
                        },
                        ticks: {
                            display: true,
                            source: 'auto',
                            maxTicksLimit: isMobile ? 5 : 8,
                            autoSkip: true,
                            autoSkipPadding: 10,
                            color: '#666666',
                            font: {
                                size: isMobile ? 10 : 12,
                                weight: '500'
                            },
                            maxRotation: isMobile ? 45 : 0,
                            minRotation: 0,
                            padding: isMobile ? 8 : 12,
                            // Format dates as "MMM d"
                            callback: function(value, index, ticks) {
                                if (value === null || value === undefined) {
                                    return '';
                                }
                                const date = new Date(value);
                                if (isNaN(date.getTime())) {
                                    return '';
                                }
                                // Skip Dec 31, 2025
                                if (date.getFullYear() === 2025 && date.getMonth() === 11 && date.getDate() === 31) {
                                    return '';
                                }
                                // Format other dates as "MMM d"
                                const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
                                return `${monthNames[date.getMonth()]} ${date.getDate()}`;
                            }
                        }
                    }
                },
                layout: {
                    padding: {
                        right: isMobile ? 30 : 120,
                        left: isMobile ? 5 : 20,
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
                        const y = lastPoint.y;
                        
                        // Get YTD percentage from current stock data (same source as leaderboard)
                        const labelParts = dataset.label.split(' (');
                        const name = labelParts[0] || '';
                        const symbol = labelParts[1] ? labelParts[1].replace(')', '') : '';
                        
                        // Use YTD from current data (same as leaderboard) instead of chart data
                        const ytdPercent = ytdMap[symbol] !== undefined ? ytdMap[symbol] : null;
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
                        
                        // Draw rounded rectangle background
                        ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
                        ctx.beginPath();
                        ctx.roundRect(rectX, rectY, rectWidth, rectHeight, borderRadius);
                        ctx.fill();
                        
                        // Draw border
                        ctx.strokeStyle = label.color;
                        ctx.lineWidth = cfg.lineWidth;
                        ctx.stroke();
                        
                        // Draw label text with better styling
                        ctx.fillStyle = '#1a1a1a'; // Dark text for better readability
                        ctx.shadowColor = 'rgba(0, 0, 0, 0.05)';
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
    } catch (error) {
        console.error('Chart error:', error);
    }
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

// Auto-refresh every 30 seconds, but only during market hours
setInterval(() => {
    if (isMarketOpen()) {
        loadLeaderboard();
        loadChart();
    }
}, 30000);

// Initial load
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        loadLeaderboard();
        setTimeout(loadChart, 100);
    });
} else {
    loadLeaderboard();
    setTimeout(loadChart, 100);
}

