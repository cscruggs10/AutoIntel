# Auction Intel

**Goal:** Pull announcement data from auction sites → database → query by buying signals

## Status: Setup Phase

### Built ✅
- PostgreSQL schema (vehicles, announcements catalog, linking tables)
- Scraper module (CSV loading, deduplication, storage logic)
- Test runlist from United Auto Exchange spreadsheet workflow

### Next: Data Collection  
**Current Task:** Build browser automation to extract announcement data

**Data Source:** AutoNiq (autoniq.com)
- Requires login (credentials stored securely)
- Access via browser relay (looks like normal human activity)
- VIN lookup → Price Evaluator page

**Announcement Data Format:**
```
United Auto Exchange Memphis
Thu, Jan 29 at 12:30PM CST
9:0546, Grade: 1.0 AS IS; INOP; TMU
```

Announcements appear after "Grade: X.X" in auction info section.

**Example extraction:**
- VIN: 1GKKNKLA6KZ107518
- Auction: United Auto Exchange Memphis  
- Lane:Lot: 9:0546
- Grade: 1.0
- Announcements: AS IS | INOP | TMU

**Bot Detection Mitigation:**
- Use browser relay (your existing session)
- Rate limiting (3-8 sec delays between lookups)
- Manual on-demand runs (not automated schedules)
- Process ~500 VINs per runlist × 20 runlists = 10k total

## Structure
- `schema.sql` - Database tables
- `scraper.js` - Core scraping/storage logic
- `test.js` - Test script
- `test-runlist.csv` - Sample data from UAX workflow

## Usage
TBD - once we nail down data access
