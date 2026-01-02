const API_BASE = '/api';

// DOM Elements
const leaderboard = document.getElementById('leaderboard');
let performanceChart = null;

// Load Leaderboard
async function loadLeaderboard() {
    try {
        const response = await fetch(`${API_BASE}/stocks/current`);
        const data = await response.json();
        
        if (!response.ok) {
            leaderboard.innerHTML = `<div class="error-message">Error: ${data.error}</div>`;
            return;
        }
        
        if (data.length === 0) {
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
                    </div>
                    <div class="price-percent-combined">
                        <div class="current-price">$${formatPrice(item.currentPrice)}</div>
                        <div class="time-periods">
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
        const response = await fetch(`${API_BASE}/stocks/monthly${useMock ? '?mock=true' : ''}`);
        const chartData = await response.json();
        
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
            '#0284c7'   // Sky Blue
        ];
        
        // Detect mobile device
        const isMobile = window.innerWidth < 768;
        
        // Get labels from backend
        const labels = chartData.months || [];
        
        // Calculate dates for all data points (constant time frame)
        const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        const currentYear = 2026;
        const baselineDate = new Date(2025, 11, 31); // Dec 31, 2025
        
        // Calculate dates for each data point
        const dates = [];
        dates.push(new Date(baselineDate)); // Index 0: Dec 31, 2025
        
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
            for (let i = 0; i < labels.length; i++) {
                const { monthIndex } = parseLabel(labels[i]);
                if (monthIndex !== -1) {
                    const lastDay = new Date(currentYear, monthIndex + 1, 0).getDate();
                    dates.push(new Date(currentYear, monthIndex, lastDay));
                }
            }
            
            // Calculate daily data count
            const monthEndCount = labels.length;
            const dailyDataCount = maxDataPoints - baselineCount - monthEndCount;
            
            // Add daily dates for current month (if we have daily data)
            if (dailyDataCount > 0 && labels.length > 0) {
                const lastMonthName = labels[labels.length - 1];
                const { monthIndex: lastMonthIndex } = parseLabel(lastMonthName);
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
            
            // Convert data to {x: date, y: value} format for time scale
            const timeData = data.map((value, idx) => {
                const date = dates[idx] || dates[0] || baselineDate;
                return {
                    x: date.getTime(),
                    y: value
                };
            });
            
            return {
                label: `${stock.name} (${stock.symbol})`,
                data: timeData,
                borderColor: color,
                backgroundColor: color,
                borderWidth: isMobile ? 1.5 : 2,
                fill: false,
                tension: 0.15,
                pointRadius: 0,
                pointHoverRadius: 0,
                pointBackgroundColor: color,
                pointBorderColor: '#ffffff',
                pointBorderWidth: 0,
                pointHoverBorderWidth: 0
            };
        });

        // Calculate min and max dates for the time scale
        const minDate = dates[0] ? dates[0].getTime() : baselineDate.getTime();
        const maxDate = dates.length > 0 && dates[dates.length - 1] ? dates[dates.length - 1].getTime() : new Date(2026, 11, 31).getTime();
        
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
                                const sign = value >= 0 ? '+' : '';
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
                        title: {
                            display: false
                        },
                        grid: {
                            display: true,
                            color: 'rgba(0, 0, 0, 0.05)',
                            drawOnChartArea: true
                        },
                        ticks: {
                            color: '#666666',
                            font: {
                                size: isMobile ? 10 : 12,
                                weight: '500'
                            },
                            maxRotation: isMobile ? 45 : 0,
                            minRotation: 0,
                            padding: isMobile ? 4 : 8,
                            // Show up to 10 day labels
                            maxTicksLimit: 10
                        }
                    }
                },
                layout: {
                    padding: {
                        right: isMobile ? 100 : 180,
                        left: isMobile ? 10 : 20,
                        top: isMobile ? 15 : 20,
                        bottom: isMobile ? 15 : 20
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
                            fontSize: '600 11px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                            textHeight: 14,
                            labelOffsetX: 10,
                            padding: 50,
                            minSpacing: 18,
                            topMargin: 5,
                            bottomMargin: 5,
                            topBound: 30,
                            bottomBound: 30,
                            labelTopMargin: 10,
                            labelBottomMargin: 10,
                            lineWidth: 1.5,
                            rectPadding: 6,
                            rectHeightOffset: 3
                        },
                        desktop: {
                            fontSize: '600 13px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                            textHeight: 18,
                            labelOffsetX: 14,
                            padding: 20,
                            minSpacing: 22,
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
                        
                        // Get YTD percentage from the last data point (value is already the YTD %)
                        const ytdPercent = typeof value === 'object' && value.y !== undefined ? value.y : value;
                        const ytdFormatted = ytdPercent !== null && ytdPercent !== undefined 
                            ? `${ytdPercent >= 0 ? '+' : ''}${ytdPercent.toFixed(1)}%`
                            : 'N/A';
                        
                        // Create label with name, symbol, and YTD percentage
                        const labelParts = dataset.label.split(' (');
                        const name = labelParts[0] || '';
                        const symbol = labelParts[1] ? labelParts[1].replace(')', '') : '';
                        // Format: "Name • SYMBOL • +12.5%"
                        const labelText = `${name} • ${symbol} • ${ytdFormatted}`;
                        
                        ctx.font = cfg.fontSize;
                        const textMetrics = ctx.measureText(labelText);
                        
                        console.log(`Adding label for dataset ${datasetIndex}:`, labelText, 'at point:', { x, y });
                        
                        labelData.push({
                            datasetIndex,
                            x: x + cfg.labelOffsetX,
                            y: y,
                            textWidth: textMetrics.width,
                            textHeight: cfg.textHeight,
                            labelText,
                            color: dataset.borderColor,
                            originalY: y,
                            originalX: x,
                            pointX: x,
                            pointY: y
                        });
                    });
                    
                    console.log(`Collected ${labelData.length} labels`);
                    
                    labelData.sort((a, b) => a.y - b.y);
                    const minSpacing = cfg.minSpacing;
                    
                    for (let i = 0; i < labelData.length; i++) {
                        const current = labelData[i];
                        for (let j = 0; j < i; j++) {
                            const previous = labelData[j];
                            const currentTop = current.y - current.textHeight / 2;
                            const currentBottom = current.y + current.textHeight / 2;
                            const previousTop = previous.y - previous.textHeight / 2;
                            const previousBottom = previous.y + previous.textHeight / 2;
                            
                            if (!(currentBottom < previousTop || currentTop > previousBottom)) {
                                const overlap = Math.min(currentBottom - previousTop, previousBottom - currentTop);
                                const adjustment = overlap / 2 + minSpacing / 2;
                                
                                if (current.y + adjustment <= chartArea.bottom - cfg.bottomMargin) {
                                    current.y += adjustment;
                                } else if (previous.y - adjustment >= chartArea.top + cfg.topMargin) {
                                    previous.y -= adjustment;
                                } else {
                                    current.y = previous.y + previous.textHeight / 2 + minSpacing + current.textHeight / 2;
                                    if (current.y > chartArea.bottom - cfg.bottomMargin) {
                                        current.y = chartArea.bottom - cfg.bottomMargin;
                                    }
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
                        
                        // Clamp Y position to ensure it's visible
                        const finalLabelY = Math.max(
                            chartArea.top + label.textHeight / 2 + 5,
                            Math.min(chartArea.bottom - label.textHeight / 2 - 5, label.y)
                        );
                        
                        console.log(`Drawing label ${label.datasetIndex} (${label.labelText}) at:`, {
                            x: finalLabelX,
                            y: finalLabelY,
                            chartArea: chartArea
                        });
                        
                        // Draw background rectangle with rounded corners
                        const rectX = finalLabelX - cfg.rectPadding;
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

// Auto-refresh every 30 seconds
setInterval(() => {
    loadLeaderboard();
    loadChart();
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

