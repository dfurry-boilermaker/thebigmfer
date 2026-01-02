# Deployment Guide

## Issue: Production site returns 404 for API endpoints

The production site (www.thebigmotherfucker.com) is currently returning 404 errors for all API endpoints. This means the Node.js server is not running or the site is on static hosting that doesn't support Node.js.

## Deployment Options

### Option 1: Node.js Hosting (Recommended)

You need a hosting service that supports Node.js. Here are some options:

#### Railway (Easy & Free tier available)
1. Go to https://railway.app
2. Connect your GitHub repo
3. Railway will auto-detect `package.json` and deploy
4. Set environment variables if needed
5. Your site will be live at `*.railway.app` or use custom domain

#### Render (Free tier available)
1. Go to https://render.com
2. Create new "Web Service"
3. Connect GitHub repo
4. Build command: `npm install`
5. Start command: `npm start`
6. Set PORT environment variable if needed

#### Heroku
1. Install Heroku CLI
2. `heroku create your-app-name`
3. `git push heroku main`
4. `heroku open`

#### DigitalOcean App Platform
1. Go to DigitalOcean App Platform
2. Connect GitHub repo
3. Auto-detects Node.js
4. Deploy

### Option 2: VPS/Server (If you have one)

If you have a VPS (DigitalOcean, AWS EC2, etc.):

```bash
# SSH into your server
ssh user@your-server

# Clone repo
git clone https://github.com/dfurry-boilermaker/thebigmfer.git
cd thebigmfer

# Install dependencies
npm install

# Install PM2 (process manager)
npm install -g pm2

# Start server
pm2 start server.js --name thebigmfer

# Save PM2 configuration
pm2 save

# Setup PM2 to start on boot
pm2 startup
```

### Option 3: Serverless Functions (If using static hosting)

If your domain is on Cloudflare Pages, Netlify, or similar static hosting, you'll need to:
- Use their serverless functions feature
- Or move to a Node.js hosting service

## Current Status Check

Run this to check your production site:
```bash
node check-production.js
```

## What to Check

1. **Is the server running?**
   - Check your hosting dashboard
   - Look for process logs
   - Verify the server process is active

2. **Are the routes configured?**
   - The server.js file should be in the root
   - package.json should have `"start": "node server.js"`

3. **Is the PORT correct?**
   - Most hosting services set PORT automatically
   - Check your hosting service's documentation

4. **Are dependencies installed?**
   - Make sure `npm install` ran successfully
   - Check for `node_modules` directory

## Quick Fix Steps

1. **Pull latest code:**
   ```bash
   git pull origin main
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Start/restart server:**
   ```bash
   # If using PM2
   pm2 restart thebigmfer
   
   # Or directly
   node server.js
   ```

4. **Test endpoints:**
   ```bash
   curl https://www.thebigmotherfucker.com/health
   curl https://www.thebigmotherfucker.com/api/stocks/current
   ```

## Need Help?

If you're using a specific hosting service, let me know which one and I can provide specific deployment instructions.

