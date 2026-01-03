# Edge Config Setup Guide

## Overview
This project uses **Vercel Edge Config** for fast, global reads of cached stock data. Edge Config is read-only from the application code and provides ultra-fast (<1ms) reads at the edge.

## Important Notes

⚠️ **Edge Config Free Tier Limits:**
- **100,000 reads/month** ✅ (plenty for your use case)
- **100 writes/month** ⚠️ (too restrictive for frequent cache updates)

**Solution:** We use **in-memory cache as primary storage** and Edge Config only for reads (when data is available). This gives you the best of both worlds:
- Fast in-memory reads (primary)
- Ultra-fast Edge Config reads (backup/fallback)
- No write limits since we're not writing to Edge Config from the app

## Setup Steps

### Option 1: Link Edge Config via Vercel Dashboard (Recommended)

1. Go to your Vercel project dashboard
2. Navigate to **Storage** → **Edge Config**
3. Find your Edge Config (ID: `ecfg_nihngnn5iudhcegkbld1erbfsfj6`)
4. Click **Link** to link it to your project
5. Vercel will automatically set the `EDGE_CONFIG` environment variable

### Option 2: Manual Environment Variable Setup

If you can't link via dashboard, you can manually set the `EDGE_CONFIG` environment variable:

1. Go to your Vercel project → **Settings** → **Environment Variables**
2. Add a new variable:
   - **Name:** `EDGE_CONFIG`
   - **Value:** `https://edge-config.vercel.com/ecfg_nihngnn5iudhcegkbld1erbfsfj6?token=5bf6b008a9ec05f6870c476d10b53211797aa000f95aae344ae60f9b422286da`
   - **Environment:** Production, Preview, Development (select all)

## How It Works

1. **Writes:** All cache writes go to **in-memory cache** (no Edge Config writes)
2. **Reads:** 
   - First checks in-memory cache (fastest)
   - If expired or missing, checks Edge Config (if available)
   - Falls back to API if both are empty/expired

## Benefits

- ✅ **No write limits** (in-memory cache is primary)
- ✅ **Ultra-fast reads** from Edge Config when available
- ✅ **Global edge distribution** for fast reads worldwide
- ✅ **Automatic fallback** to in-memory cache if Edge Config unavailable

## Current Implementation

The code automatically:
- Uses in-memory cache as primary storage
- Attempts to read from Edge Config if `EDGE_CONFIG` env var is set
- Falls back gracefully if Edge Config is unavailable
- No writes to Edge Config (stays within free tier limits)

## Testing

After setting up Edge Config, you can test it:

```bash
# Check if Edge Config is initialized (look for log message)
# In Vercel logs, you should see: "Vercel Edge Config initialized successfully (read-only)"
```

## Troubleshooting

**Issue:** "EDGE_CONFIG environment variable not set"
- **Solution:** Link Edge Config in Vercel dashboard or set the env var manually

**Issue:** Edge Config reads return null
- **Solution:** This is expected initially - Edge Config is read-only and won't have data until you manually populate it via Vercel API or dashboard. The in-memory cache will handle all caching.

**Issue:** Want to populate Edge Config manually
- **Solution:** Use Vercel API or dashboard to write initial data. However, this is optional since in-memory cache handles all writes.

