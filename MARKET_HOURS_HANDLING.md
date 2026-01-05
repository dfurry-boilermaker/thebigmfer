# Market Hours and Weekend Handling

## Overview

The application intelligently handles market hours and weekends to minimize API calls while keeping data fresh during trading hours.

---

## Market Hours Detection

### Backend (`api/utils.js`)

**`isMarketOpen()` Function:**
- Checks if current time is during market hours
- **Market Hours:** 9:30 AM - 4:00 PM Eastern Time (ET)
- **Weekdays Only:** Monday-Friday (excludes weekends)
- Uses `America/New_York` timezone for accurate ET conversion

**`isDuringMarketHours(date)` Function:**
- Checks if a specific date/time is during market hours
- Filters out weekends (Saturday = 6, Sunday = 0)
- Filters out times outside 9:30 AM - 4:00 PM ET

### Frontend (`public/app.js`)

**`isMarketOpen()` Function:**
- Same logic as backend
- Used to control auto-refresh behavior
- Prevents unnecessary API calls when market is closed

---

## Cache Behavior by Market Status

### During Market Hours (9:30 AM - 4:00 PM ET, Weekdays)

**Cache TTL:** 15 minutes (900 seconds)

**Behavior:**
- ✅ Cache expires every 15 minutes
- ✅ First user after expiration triggers fresh API call
- ✅ Subsequent users get cached data for 15 minutes
- ✅ Frontend auto-refreshes every 15 minutes (if market is open)

**Example:**
- 9:30 AM: First user triggers API call, data cached
- 9:35 AM: Users get cached data (still fresh)
- 9:45 AM: Cache expires, next user triggers new API call
- 9:46 AM: Users get fresh cached data

### After Market Hours (Evenings, Weekends, Holidays)

**Cache TTL:** 24 hours (86,400 seconds)

**Behavior:**
- ✅ Cache lasts 24 hours (no need to refresh when market is closed)
- ✅ All users get cached data (no API calls)
- ✅ Frontend auto-refresh is **disabled** when market is closed
- ✅ Data from last market close is served until market reopens

**Example:**
- 4:00 PM Friday: Last API call, data cached for 24 hours
- 4:01 PM - 9:29 AM Monday: All users get cached Friday close data
- 9:30 AM Monday: Cache expires, first user triggers fresh API call

---

## API Call Flow

### When Market is Open:

1. **User visits site**
2. **Check cache:**
   - If cache exists and is < 15 minutes old → Return cached data ✅
   - If cache expired (> 15 minutes old) → Fetch fresh data from API
3. **Cache fresh data** with 15-minute TTL
4. **Frontend auto-refresh:** Every 15 minutes (if market still open)

### When Market is Closed:

1. **User visits site**
2. **Check cache:**
   - If cache exists and is < 24 hours old → Return cached data ✅
   - If cache expired (> 24 hours old) → Fetch fresh data from API (will be same as last close)
3. **Cache data** with 24-hour TTL
4. **Frontend auto-refresh:** **Disabled** (no refresh when market closed)

---

## Weekend Handling

### Saturdays & Sundays:

- **Market Status:** Closed
- **Cache Behavior:** 24-hour TTL (serves Friday's closing data)
- **API Calls:** None (unless cache expired)
- **Frontend Refresh:** Disabled

### Example Weekend Flow:

**Friday 4:00 PM:**
- Last API call of the week
- Data cached with 24-hour TTL

**Saturday:**
- All users get Friday's closing data
- No API calls
- No frontend refresh

**Sunday:**
- All users get Friday's closing data
- No API calls
- No frontend refresh

**Monday 9:30 AM:**
- Cache expires (24 hours passed)
- First user triggers fresh API call
- New week's data cached with 15-minute TTL

---

## Code Locations

### Backend Market Hours Detection:
- **File:** `api/utils.js`
- **Functions:**
  - `isMarketOpen()` - Checks if market is currently open
  - `isDuringMarketHours(date)` - Checks if specific time is during market hours
  - `shouldUseCache()` - Determines if cached data should be used

### Cache TTL Setting:
- **File:** `api/stocks/current.js` (line 224)
- **File:** `api/stocks/monthly.js` (line 191)
- **Logic:** `const ttlSeconds = isMarketOpen() ? 900 : 86400;`
  - Market open: 15 minutes (900 seconds)
  - Market closed: 24 hours (86,400 seconds)

### Frontend Auto-Refresh:
- **File:** `public/app.js` (line 1505)
- **Logic:**
  ```javascript
  setInterval(() => {
      if (isMarketOpen()) {
          loadLeaderboard();
          loadChart();
      }
  }, 900000); // 15 minutes
  ```
- **Behavior:** Only refreshes if market is open

---

## Benefits

1. **Minimizes API Calls:**
   - No calls during weekends/evenings
   - Only refreshes every 15 minutes during market hours
   - 24-hour cache when market is closed

2. **Fresh Data During Trading:**
   - 15-minute refresh ensures data is current
   - First user after expiration triggers update
   - Subsequent users get fresh cached data

3. **Efficient Resource Usage:**
   - No unnecessary API calls when market is closed
   - No frontend refresh when market is closed
   - Saves API quota and server resources

---

## Edge Cases Handled

1. **Market Opens (9:30 AM ET):**
   - Cache from previous day expires
   - First user triggers fresh API call
   - New data cached with 15-minute TTL

2. **Market Closes (4:00 PM ET):**
   - Last API call cached with 24-hour TTL
   - Subsequent requests use cached data
   - Frontend refresh disabled

3. **Holidays:**
   - Treated as market closed
   - 24-hour cache TTL applies
   - No API calls until market reopens

4. **Timezone Handling:**
   - All market hours checks use Eastern Time (ET)
   - Properly converts user's local time to ET
   - Handles daylight saving time automatically

---

## Summary

✅ **Market Hours (9:30 AM - 4:00 PM ET, Weekdays):**
- 15-minute cache TTL
- Frontend auto-refresh every 15 minutes
- First user after expiration triggers API call

✅ **After Hours / Weekends:**
- 24-hour cache TTL
- No frontend auto-refresh
- All users get cached data (no API calls)

✅ **Result:**
- Efficient API usage
- Fresh data during trading hours
- No unnecessary calls when market is closed

