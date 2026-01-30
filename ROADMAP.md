# 🗺️ AutoIntel Roadmap

## ✅ Phase 1: Foundation (COMPLETE)
- [x] Database schema design
- [x] Historical sales import (2,013 records)
- [x] Full data capture (36 fields)
- [x] Weekly update script with upsert logic
- [x] Backup system

## 🚧 Phase 2: Runlist Processing (NEXT - 2-3 days)

### 2.1 CSV Upload & Parsing
**Goal:** Upload auction runlist CSVs and extract vehicle data

**Tasks:**
- [ ] Parse common runlist CSV formats (Manheim, ADESA, etc.)
- [ ] Extract: VIN, Year, Make, Model, Lane, Lot, etc.
- [ ] Handle multiple CSV formats (flexible parser)
- [ ] Store in `runlist_vehicles` table
- [ ] API endpoint: `POST /api/runlist/upload`

**Test Data Needed:** Sample runlist CSV from your next auction

### 2.2 Matching Algorithm
**Goal:** Match runlist vehicles against historical sales data

**Strategy:**
1. **Exact VIN match** (same vehicle sold before)
2. **YMM match** (Year/Make/Model)
3. **Similarity scoring** (consider mileage ranges, trim levels)

**Metrics to Calculate:**
- Number of similar vehicles sold
- Average purchase price
- Average sales price
- Average gross profit
- Average net profit
- Average days to sell
- Success rate (% profitable)
- Price variance (risk indicator)

**Output:**
- Flag high-confidence matches
- Show profit potential
- Risk indicators

### 2.3 Results Display
- [ ] API endpoint: `GET /api/runlist/:id`
- [ ] Sort by profit potential
- [ ] Filter: matched only, high confidence, etc.
- [ ] Export to CSV

**Timeline:** 2-3 days

---

## 🎯 Phase 3: AUTONIQ Integration (3-5 days)

### 3.1 Scraper Pipeline
**Goal:** Auto-scrape matched vehicles from AUTONIQ

**Features:**
- [ ] Login automation (already working)
- [ ] Search by VIN
- [ ] Extract announcements (AS IS, INOP, TMU, etc.)
- [ ] Extract condition reports
- [ ] Store in `autoniq_data` table
- [ ] Handle rate limiting (scrape intelligently)
- [ ] Retry logic for failures

### 3.2 Announcement Analysis
**Goal:** Apply buy signals based on condition

**Rules Engine:**
- Green flags: Clean title, minor cosmetic issues
- Yellow flags: Mechanical issues (assess risk)
- Red flags: Frame damage, flood, major mechanical

### 3.3 API Integration
- [ ] `POST /api/scrape/:runlist_id` - Start scraping
- [ ] `GET /api/scrape/:runlist_id/status` - Check progress
- [ ] `GET /api/vehicle/:vin/autoniq` - Get scraped data

**Timeline:** 3-5 days

---

## 📊 Phase 4: Dashboard UI (5-7 days)

### 4.1 Core Views
- [ ] Runlist overview (list all uploads)
- [ ] Vehicle detail page (history + AUTONIQ data)
- [ ] Match results (sortable, filterable)
- [ ] Profit analysis charts

### 4.2 Decision Tools
- [ ] Buy/Pass/Watch flags
- [ ] Notes per vehicle
- [ ] Export buy list for auction

### 4.3 Analytics
- [ ] Performance tracking (how did predictions do?)
- [ ] ROI analysis
- [ ] Trend identification

**Timeline:** 5-7 days

---

## 🔐 Phase 5: Multi-User & Production (3-4 days)

### 5.1 Authentication
- [ ] User login/signup
- [ ] Role-based access (admin, buyer, analyst)
- [ ] API key management

### 5.2 Production Hardening
- [ ] Error monitoring
- [ ] Logging
- [ ] Rate limiting
- [ ] Data backups (automated)

### 5.3 Deployment
- [ ] Railway production setup
- [ ] Custom domain
- [ ] SSL/HTTPS
- [ ] Environment configs

**Timeline:** 3-4 days

---

## 🚀 Phase 6: Advanced Features (Ongoing)

### Future Enhancements
- [ ] Mobile app (React Native)
- [ ] Real-time auction alerts
- [ ] Market trend analysis
- [ ] Predictive pricing (ML model)
- [ ] Integrations: DMS systems, accounting
- [ ] Bulk VIN decoder
- [ ] Image analysis (damage detection)
- [ ] Multi-auction support

---

## 📅 Overall Timeline

**Weeks 1-2:** Phases 2-3 (Runlist + AUTONIQ)  
**Weeks 3-4:** Phase 4 (Dashboard UI)  
**Week 5:** Phase 5 (Production ready)  
**Ongoing:** Phase 6 (Advanced features)

---

## 🎯 Immediate Next Steps

1. **Get sample runlist CSV** - Send Corey an example auction runlist
2. **Build CSV parser** - Handle various formats
3. **Implement matching algorithm** - YMM similarity scoring
4. **Test with real data** - Validate match quality

Once matching works well, integrate AUTONIQ scraper.

---

**Key Decision Point:** Do you want to see matching results first, or jump straight to full AUTONIQ integration?

Recommendation: Build matching first (2 days), validate quality, then add AUTONIQ layer. Faster feedback loop.
