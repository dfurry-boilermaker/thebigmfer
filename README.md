# Stock Competition Tracker

A real-time stock competition tracking application that displays YTD performance, interactive charts, and manager analyses. Perfect for tracking friendly equity competitions with multiple participants.

**Live Demo:** https://thebigmotherfucker.com

## Features

- 📊 **Real-time YTD Performance**: Automatically calculates year-to-date returns including dividends
- 📈 **Interactive Charts**: Trading-day filtered charts with smooth weekend gap removal
- 🏆 **Leaderboard**: Ranked display of all participants with color-coded performance
- 💬 **Manager Analyses**: Click-to-expand investment thesis for each participant
- 📱 **Responsive Design**: Optimized for desktop, tablet, and mobile devices
- ⚡ **Fast Performance**: Caching system with Edge Config for minimal API calls
- 🎨 **Customizable Colors**: Assign unique colors to each manager/participant

## Quick Start

### Prerequisites

- Node.js 14+ installed
- npm or yarn package manager
- (Optional) Vercel account for deployment

### Local Development

1. **Clone the repository**
   ```bash
   git clone https://github.com/yourusername/thebigmfer.git
   cd thebigmfer
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Configure your competition**
   - Copy `managers.json.example` to `managers.json`
   - Edit `managers.json` with your participants (see Configuration section below)

4. **Start the development server**
   ```bash
   npm start
   # or for auto-reload:
   npm run dev
   ```

5. **Open your browser**
   - Navigate to `http://localhost:3000`

## Configuration

### Setting Up Your Competition

Edit `managers.json` to add your participants:

```json
[
  {
    "name": "Participant Name",
    "stockSymbol": "AAPL",
    "analysis": "Your investment thesis here. Explain why you picked this stock."
  },
  {
    "name": "Another Participant",
    "stockSymbol": "TSLA",
    "analysis": "Another analysis here."
  }
]
```

**Fields:**
- `name`: Display name of the participant
- `stockSymbol`: Stock ticker symbol (e.g., "AAPL", "TSLA", "MSFT")
- `analysis`: Investment thesis or explanation (shown when user clicks on participant)

### Customizing Colors

To assign custom colors to specific participants, edit `public/app.js` and add entries to the `managerColors` object:

```javascript
const managerColors = {
    'Greg': '#8B4513',  // Brown
    'Daniel': '#FF6B6B', // Custom color
    // Add more as needed
};
```

If a participant doesn't have a custom color, a default color will be assigned automatically.

### Changing the Competition Year

The app calculates YTD performance from December 31 of the previous year. To change the baseline year:

1. Edit `api/utils.js` and update the `BASELINE_DATE` constant:
   ```javascript
   const BASELINE_DATE = new Date('2025-12-31'); // Change year as needed
   ```

2. Update the `getBaselinePrices` function if you need different baseline logic.

## Deployment

### Deploying to Vercel

1. **Install Vercel CLI** (optional, or use GitHub integration)
   ```bash
   npm i -g vercel
   ```

2. **Deploy**
   ```bash
   vercel
   ```
   Follow the prompts to link your project.

3. **Set Environment Variables** (Optional)
   - `EDGE_CONFIG`: Vercel Edge Config connection string (for caching)
   - `CRON_SECRET`: Secret for protecting cron endpoints (optional)

4. **Configure Cron Job** (Optional)
   - In Vercel dashboard, add a cron job that calls `/api/cron/refresh-cache` every 15 minutes during market hours
   - This keeps the cache fresh without users waiting for API calls

### Manual Deployment

The app can be deployed to any Node.js hosting service:
- Heroku
- Railway
- DigitalOcean App Platform
- AWS Lambda (with modifications)

Ensure your hosting service:
- Supports Node.js 14+
- Can run Express.js applications
- Has access to external APIs (Yahoo Finance)

## API Endpoints

The application exposes several API endpoints:

- `GET /api/stocks/current` - Current stock prices and YTD performance
- `GET /api/stocks/monthly` - Historical data for charts
- `GET /api/indexes` - Benchmark data (S&P 500, etc.)
- `GET /api/health` - Health check endpoint
- `GET /api/cron/refresh-cache` - Cache refresh (cron job)

## How It Works

### Data Sources

- **Yahoo Finance API**: Primary data source via `yahoo-finance2` package
  - No API key required
  - Provides real-time quotes, historical data, and dividend information

### Caching Strategy

1. **In-Memory Cache**: Primary cache for fast responses
2. **Edge Config** (Optional): Persistent cache across deployments
3. **Cache Refresh**: Automatic refresh during market hours

### Trading Day Filtering

The app automatically:
- Filters out weekends and holidays from charts
- Removes gaps between Friday and Monday on the x-axis
- Only shows data for actual trading days

### YTD Calculation

YTD performance includes:
- Price appreciation from baseline date (Dec 31 of previous year)
- Dividend yield (YTD dividends / baseline price)

## Customization Guide

### Changing the Theme

Edit `public/styles.css` to customize:
- Colors and branding
- Font sizes and families
- Layout and spacing
- Mobile breakpoints

### Adding Benchmarks

To add additional benchmarks (like the S&P 500), edit `api/indexes.js` and add entries to the `indexes` array.

### Modifying Chart Display

Chart configuration is in `public/app.js` in the `renderChart` function. You can customize:
- Chart type (currently line chart)
- Colors and styling
- Axis labels and formatting
- Tooltips and interactions

## Troubleshooting

### Site is Blank

- Check browser console for JavaScript errors
- Verify `managers.json` is valid JSON
- Ensure stock symbols are valid tickers
- Check that Yahoo Finance API is accessible

### Data Not Updating

- Verify market hours (data only updates during trading hours)
- Check cache refresh cron job is running (if deployed)
- Clear browser cache and refresh

### Local Server Issues

- Ensure port 3000 is not in use
- Check Node.js version (14+ required)
- Verify all dependencies are installed (`npm install`)

## Project Structure

```
thebigmfer/
├── api/                    # Vercel serverless functions
│   ├── stocks/            # Stock data endpoints
│   ├── indexes.js         # Benchmark data
│   ├── utils.js           # Shared utilities
│   └── cron/              # Background jobs
├── public/                # Frontend files
│   ├── app.js            # Main application logic
│   ├── styles.css        # Styling
│   └── index.html        # HTML template
├── server.js              # Local development server
├── managers.json          # Competition participants (create from example)
├── managers.json.example  # Example configuration
├── package.json           # Dependencies
└── vercel.json            # Vercel configuration
```

## Contributing

Feel free to fork this project and customize it for your own competition! Some ideas for improvements:

- Add more chart types
- Support multiple stocks per participant
- Add historical performance comparisons
- Implement user authentication
- Add email notifications for winners

## License

This project is open source and available for personal and commercial use.

## Support

For issues or questions:
1. Check the troubleshooting section above
2. Review the code comments for implementation details
3. Open an issue on GitHub

---

**Happy Trading! 📈**
