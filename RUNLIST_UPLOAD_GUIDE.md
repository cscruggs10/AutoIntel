# 📋 Runlist Upload & Matching Guide

## ✅ **Phase 2 Complete - Runlist Processing Live!**

The runlist matching system is now operational. Upload auction CSVs and instantly see which vehicles match your historical sales data.

---

## 🎯 **What It Does**

1. **Upload** auction runlist CSV
2. **Parse** vehicle data (VIN, Year, Make, Model, Mileage, etc.)
3. **Match** against your 2,013 historical sales records
4. **Rank** by match strength:
   - **Exact VIN** - This exact vehicle sold before
   - **Strong (YMM)** - Exact Year/Make/Model match
   - **Moderate** - Similar year (±2 years) + Make/Model
   - **Weak** - Same Make/Model, any year

---

## 📤 **How to Upload**

### **Option 1: API (cURL)**

```bash
curl -X POST http://localhost:3000/api/runlist/upload \
  -F "file=@your-runlist.csv" \
  -F "auction_name=Americas Auto Auction - Atlanta Cartersville, GA" \
  -F "auction_date=2026-02-05"
```

**Response:**
```json
{
  "success": true,
  "runlist": {
    "id": 1,
    "name": "your-runlist.csv",
    "auction_name": "Americas Auto Auction - Atlanta Cartersville, GA",
    "auction_date": "2026-02-05"
  },
  "message": "Uploaded 150 vehicles. Matching against historical data...",
  "next_step": "GET /api/runlist/1 to view results"
}
```

---

### **Option 2: JavaScript (Postman/Fetch)**

```javascript
const formData = new FormData();
formData.append('file', fileInput.files[0]);
formData.append('auction_name', 'Americas Auto Auction - Atlanta Cartersville, GA');
formData.append('auction_date', '2026-02-05');

fetch('http://localhost:3000/api/runlist/upload', {
  method: 'POST',
  body: formData
})
.then(res => res.json())
.then(data => console.log(data));
```

---

## 📊 **View Results**

```bash
curl http://localhost:3000/api/runlist/1
```

**Response:**
```json
{
  "runlist": {
    "id": 1,
    "name": "sample-runlist.csv",
    "auction_name": "Americas Auto Auction - Atlanta Cartersville, GA",
    "auction_date": "2026-01-30",
    "total_vehicles": 5,
    "matched_vehicles": 3,
    "status": "matched"
  },
  "vehicles": [
    {
      "vin": "1GKKNKLA7HZ237672",
      "year": 2017,
      "make": "GMC",
      "model": "Acadia",
      "mileage": 146062,
      "lane": "A",
      "lot": "1",
      "matched": true,
      "match_count": 4,
      "last_sold_date": "2025-10-16"
    }
  ],
  "stats": {
    "total": 5,
    "matched": 3,
    "unmatched": 2,
    "needs_scraping": 3
  }
}
```

---

## 🏭 **Supported Auction Formats**

### **Currently Configured:**

1. **Americas Auto Auction - Atlanta Cartersville, GA**
   - Columns: VIN, Year, Make, Model, Mileage, Lane, Lot, Grade, etc.

### **Need Another Format?**

Send Corey:
1. Sample CSV from the new auction house
2. Auction name (exact)

I'll add the column mapping in ~10 minutes.

---

## 🔧 **API Reference**

### **GET /api/auctions**
List supported auction formats

```bash
curl http://localhost:3000/api/auctions
```

Response:
```json
{
  "auctions": [
    "Americas Auto Auction - Atlanta Cartersville, GA"
  ]
}
```

---

### **POST /api/runlist/upload**
Upload and match runlist

**Parameters:**
- `file` (required) - CSV file
- `auction_name` (required) - Must match supported auction
- `auction_date` (required) - Format: YYYY-MM-DD

---

### **GET /api/runlist/:id**
Get runlist with match results

**Response includes:**
- All vehicles with match data
- Stats (matched/unmatched counts)
- Top 10 matches summary

---

### **GET /api/runlists**
List all uploaded runlists

```bash
curl http://localhost:3000/api/runlists
```

---

## 🎯 **Match Strength Guide**

| Strength | Match Type | Meaning | Example |
|----------|-----------|---------|---------|
| **Exact** | VIN | Same vehicle sold before | This exact 2020 Honda Pilot (VIN match) |
| **Strong** | Year/Make/Model | Exact YMM match | 2017 GMC Acadia - sold 4 times |
| **Moderate** | Similar YMM | ±2 years + Make/Model | 2015-2019 Toyota Camry - sold 12 times |
| **Weak** | Make/Model | Any year | Honda Pilot (2010-2025) - sold 8 times |
| **None** | - | Not in history | Never sold this vehicle type |

---

## 🚀 **Next: AUTONIQ Integration**

**Current:** Matched vehicles flagged as `needs_scraping: true`

**Next Phase (3-5 days):**
- Auto-scrape AUTONIQ for matched vehicles
- Extract announcements (AS IS, INOP, TMU, etc.)
- Apply buy/pass signals

**For now:** Use match count to prioritize which vehicles to research manually.

---

## 📝 **Example Workflow**

```bash
# 1. Check supported auctions
curl http://localhost:3000/api/auctions

# 2. Upload runlist
curl -X POST http://localhost:3000/api/runlist/upload \
  -F "file=@atlanta-jan-30-2026.csv" \
  -F "auction_name=Americas Auto Auction - Atlanta Cartersville, GA" \
  -F "auction_date=2026-01-30"

# Returns: { "runlist": { "id": 2 } }

# 3. View results
curl http://localhost:3000/api/runlist/2

# 4. Focus on matched vehicles
# - Sort by match_count
# - Check vehicles with high historical sales
# - Research on AUTONIQ manually (for now)
```

---

## 🎉 **Test Results**

Sample runlist (5 vehicles):
- ✅ **3 matched** (60% hit rate)
- ❌ 2 unmatched (not in your buying profile)

**Top matches:**
- 2017 GMC Acadia - 4 historical sales
- 2007 Toyota Camry - 3 historical sales
- 2020 Honda Pilot - 1 historical sale

---

## ⏱️ **Timeline Complete**

**Estimated:** 4 hours  
**Actual:** 3.5 hours ✅

**What's working:**
- CSV upload ✅
- Parsing (Americas Auto Auction format) ✅
- Matching algorithm (4 strength levels) ✅
- API endpoints ✅
- Database schema ✅

**Ready for:** Real runlist uploads!

---

## 🤔 **Questions?**

1. **Where's the UI?** API-only for now. Dashboard coming in Phase 4.
2. **Can I upload other auction formats?** Yes - send sample CSV, I'll add it.
3. **What about MMR/CR values?** Not in this auction format, but system is ready when available.
4. **AUTONIQ scraping?** Phase 3 - coming next (3-5 days).

---

**Ready to upload your first real runlist!** 🚀
