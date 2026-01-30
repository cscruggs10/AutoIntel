# 📋 Auction Format Groups

## 🎯 **Smart Format Detection**

AutoIntel uses **format groups** instead of per-location mappings. This means:

✅ **One mapping for entire auction network**  
✅ **Automatic format detection**  
✅ **No setup needed per location**

---

## 🏭 **Supported Format Groups**

### **1. Manheim (All Locations)**

**Detects:** Any auction name containing "Manheim"

**Examples:**
- Manheim Little Rock
- Manheim Dallas
- Manheim Chicago
- Manheim Atlanta
- Manheim [any location]

**Fields Captured:**
- VIN, Year, Make, Model, Trim
- **MMR Value** ✅
- Condition Report Grade
- Mileage (Odometer Value)
- Lane, Run Number
- Interior Color, Exterior Color
- Seller Name, Auction House

**Sample Data:**
```csv
Vin,Year,Make,Model,Trim,MMR,Grade
5XYP5DGC6SG673069,2025,Kia,Telluride,SX Prestige,45100,5.0
```

---

### **2. Edge Pipeline (All Edge Pipeline Auctions)**

**Detects:** Auction names containing:
- "Americas Auto Auction"
- "United Auto Exchange"
- "Carolina Auto Auction"
- "Tri-Cities Auto Auction"

**Examples:**
- Americas Auto Auction - Atlanta Cartersville, GA
- Americas Auto Auction - Nashville, TN
- United Auto Exchange Memphis
- United Auto Exchange [any location]

**Fields Captured:**
- VIN, Year, Make, Model, Style
- Mileage
- Lane, Lot, Run Number
- Stock Number
- Exterior Color
- Has Condition Report (TRUE/FALSE)
- Grade (if available)

**Sample Data:**
```csv
Vin,Year,Make,Model,Style,Mileage,Lane,Lot,Grade
1GKKNKLA7HZ237672,2017,GMC,Acadia,SLE,146062,A,1,
```

---

## 🔍 **How Detection Works**

```javascript
// System checks auction name:
if (name.includes('manheim')) {
  return 'Manheim';
} else if (name.includes('americas auto auction')) {
  return 'Edge Pipeline';
}
```

**Result:** Upload from any Manheim location → Uses Manheim format automatically

---

## ➕ **Adding New Format Groups**

Need support for another auction network?

**Process:**
1. Send sample CSV (3-5 rows)
2. Provide auction network name
3. I'll add format group (~15 minutes)

**Example networks to add:**
- ADESA auctions
- CarMax auctions
- IAA (Insurance Auto Auctions)
- Copart

---

## 📊 **Field Mapping Reference**

### **Manheim Format Columns:**
```
Vin → VIN
Year → Year
Make → Make
Model → Model
Trim → Style
Odometer Value → Mileage
MMR → MMR Value
Condition Report Grade → Grade
Lane → Lane
Run → Run Number
Exterior Color → Exterior Color
Interior Color → Interior Color
```

### **Edge Pipeline Format Columns:**
```
Vin → VIN
Year → Year
Make → Make
Model → Model
Style → Style
Mileage → Mileage
Lane → Lane
Lot → Lot
Run Number → Run Number
Stock Number → Stock Number
Exterior Color → Exterior Color
Has Condition Report → Has Condition Report
Grade → Grade
```

---

## 🧪 **Testing Both Formats**

Run format test:
```bash
node test-formats.js
```

**Output:**
```
✅ Edge Pipeline: 5 vehicles parsed, 3 matched (60%)
✅ Manheim: 3 vehicles parsed, MMR values captured
```

---

## 💡 **Pro Tips**

1. **Use exact auction name** - System detects format automatically
2. **MMR values** - Only available in Manheim format
3. **Grade scores** - Available in both formats (when present)
4. **Invalid mileage** - System filters out 999990 (common placeholder)

---

## 🚀 **Upload Examples**

### **Manheim Upload:**
```bash
curl -X POST http://localhost:3000/api/runlist/upload \
  -F "file=@manheim-dallas-feb-05.csv" \
  -F "auction_name=Manheim Dallas" \
  -F "auction_date=2026-02-05"
```

### **Edge Pipeline Upload:**
```bash
curl -X POST http://localhost:3000/api/runlist/upload \
  -F "file=@united-auto-memphis.csv" \
  -F "auction_name=United Auto Exchange Memphis" \
  -F "auction_date=2026-02-05"
```

**System automatically detects and applies correct format!**

---

## 📈 **What Happens After Upload**

1. **Format Detection** - System identifies Manheim or Edge Pipeline
2. **CSV Parsing** - Maps columns to standardized fields
3. **Data Validation** - Filters invalid VINs, mileage, etc.
4. **Database Insert** - Stores all vehicles
5. **Matching Engine** - Matches against 2,013 historical sales
6. **Results** - View matches via API

**Timeline:** ~5 seconds for 100-vehicle runlist

---

## 🎯 **Next Features**

- **ADESA format** (when sample provided)
- **IAA format** (when sample provided)
- **Custom format builder** (UI-based column mapping)
- **Announcement extraction** (from runlist CSVs when available)

---

**Questions?** See [RUNLIST_UPLOAD_GUIDE.md](RUNLIST_UPLOAD_GUIDE.md) for full API documentation.
