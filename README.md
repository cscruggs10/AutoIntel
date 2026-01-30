# AutoIntel

**Auction Intelligence Platform** for automotive wholesale buyers.

## Overview

AutoIntel uses **two-stage filtering** to identify profitable auction vehicles:

1. **Stage 1: Historical Match Filter** (fast)
   - Upload runlist (VIN list from auction)
   - Match against 2,000+ historical sales
   - Flag vehicles similar to past profitable deals

2. **Stage 2: AUTONIQ Scraper** (targeted)
   - Scrape only matched vehicles
   - Extract announcements (AS IS, INOP, TMU, etc.)
   - Apply buy signals based on condition

This approach **saves time and money** - only scrape what matches your buying profile!

## Setup

### 1. Install Dependencies
```bash
npm install
```

### 2. Configure Environment
```bash
cp .env.example .env
# Edit .env with your credentials
```

### 3. Set Up Database
```bash
# Initial setup:
psql $DATABASE_URL < database/schema.sql
node database/import-sales.js
```

### 4. Weekly Data Updates
```bash
# Export fresh sales-data.csv from your DMS
# Place it in project root, then:
./scripts/weekly-update.sh

# This will:
# - Backup existing data
# - Import new/updated records (upsert logic)
# - Show updated stats
```

### 5. Start Server
```bash
npm start
```

## Workflow

### Upload Runlist
POST `/api/runlist/upload`
- Upload CSV with VINs
- System matches against historical sales
- Returns matched vehicles with profit estimates

### View Results
GET `/api/runlist/:id`
- See all vehicles in runlist
- Matched vehicles show:
  - How many similar vehicles sold
  - Average profit
  - Average days to sell
  - Price ranges

### Scrape AUTONIQ (Coming Next)
POST `/api/scrape/:runlist_id`
- Scrapes only matched vehicles
- Extracts announcements and condition
- Stores in database for analysis

## Architecture

- **Express.js** - Web server
- **PostgreSQL** - Database (historical sales, runlists, scraped data)
- **Playwright** - AUTONIQ automation
- **Railway** - Hosting platform

## Database Schema

### historical_sales
Your past deals - used for matching

### runlists
Uploaded auction lists

### runlist_vehicles
Individual VINs with match data

### autoniq_data
Scraped announcements and condition reports

## Development

```bash
# Watch mode
npm run dev

# Check API status
curl https://autointel-production.up.railway.app/api/status
```

## Roadmap

- [x] Historical sales import (2,013 records)
- [x] Weekly data updates (upsert script)
- [x] CSV parsing for runlists
- [x] Runlist upload API
- [x] Matching algorithm (4 strength levels)
- [ ] AUTONIQ scraper integration (Phase 3)
- [ ] Dashboard UI (Phase 4)
- [ ] User authentication (Phase 5)
- [ ] Export results

## Quick Start

### Upload a Runlist

**Manheim Example:**
```bash
curl -X POST http://localhost:3000/api/runlist/upload \
  -F "file=@manheim-little-rock.csv" \
  -F "auction_name=Manheim Little Rock" \
  -F "auction_date=2026-02-05"
```

**Edge Pipeline Example:**
```bash
curl -X POST http://localhost:3000/api/runlist/upload \
  -F "file=@americas-atlanta.csv" \
  -F "auction_name=Americas Auto Auction - Atlanta Cartersville, GA" \
  -F "auction_date=2026-02-05"
```

**Supported Format Groups:**
- **Manheim** (all locations) - Includes MMR values
- **Edge Pipeline** (Americas Auto, United Auto, etc.)

### View Results

```bash
curl http://localhost:3000/api/runlist/1
```

**See:** [RUNLIST_UPLOAD_GUIDE.md](RUNLIST_UPLOAD_GUIDE.md) for full API documentation.
