# Debugging Guide for thebigmfer

## Local Testing

### 1. Start the Server
```bash
npm install  # First time only
npm start    # or: node server.js
```

### 2. Test API Endpoints

**Health Check:**
```bash
curl http://localhost:3000/health
```

**Current Stocks:**
```bash
curl http://localhost:3000/api/stocks/current | python3 -m json.tool
```

**Monthly Stocks:**
```bash
curl http://localhost:3000/api/stocks/monthly | python3 -m json.tool
```

**Mock Data:**
```bash
curl "http://localhost:3000/api/stocks/monthly?mock=true" | python3 -m json.tool
```

### 3. Run Test Script
```bash
node test-api.js
```

### 4. Check Server Logs
```bash
tail -f server.log  # If running with logging
# Or check console output if running directly
```

## Common Issues

### Issue: "Cannot GET /api/stocks/current"
**Solution:** Make sure the server is running and the route is defined in server.js

### Issue: Empty data array
**Possible causes:**
1. `managers.json` not found or empty
2. Yahoo Finance API errors
3. Network issues

**Debug steps:**
1. Check if managers.json exists: `cat managers.json`
2. Check server logs for errors
3. Test Yahoo Finance API directly:
   ```javascript
   const yahooFinance = require('yahoo-finance2').default;
   yahooFinance.quote('NVDA').then(console.log);
   ```

### Issue: CORS errors in browser
**Solution:** CORS headers are already added in server.js. Make sure server is running the latest code.

### Issue: Data shows but chart doesn't render
**Check:**
1. Browser console for JavaScript errors
2. Network tab to see if API calls succeed
3. Chart.js library loaded correctly

## Production Deployment Checklist

1. ✅ Pull latest code: `git pull origin main`
2. ✅ Install dependencies: `npm install`
3. ✅ Ensure `managers.json` exists
4. ✅ Set PORT environment variable if needed
5. ✅ Restart server: `pm2 restart thebigmfer` or restart process
6. ✅ Test endpoints on production URL
7. ✅ Check server logs for errors

## Testing Production

Test your production site:
```bash
curl https://www.thebigmotherfucker.com/health
curl https://www.thebigmotherfucker.com/api/stocks/current
```

