const express = require('express');
const multer = require('multer');
const { Pool } = require('pg');
const { parseRunlist, getSupportedAuctions } = require('../lib/runlist-parser');
const { matchRunlist } = require('../lib/matcher');
const router = express.Router();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

const upload = multer({ dest: 'uploads/' });

// API Status
router.get('/status', async (req, res) => {
  try {
    const dbCheck = await pool.query('SELECT NOW()');
    const salesCount = await pool.query('SELECT COUNT(*) FROM historical_sales');
    const runlistCount = await pool.query('SELECT COUNT(*) FROM runlists');
    
    res.json({ 
      message: 'AutoIntel API',
      version: '1.0.0',
      status: 'operational',
      database: 'connected',
      stats: {
        historical_sales: parseInt(salesCount.rows[0].count),
        runlists: parseInt(runlistCount.rows[0].count)
      }
    });
  } catch (err) {
    res.status(500).json({ 
      status: 'error', 
      message: err.message 
    });
  }
});

// Get supported auction formats
router.get('/auctions', (req, res) => {
  const auctions = getSupportedAuctions();
  res.json({ auctions });
});

// Upload runlist CSV
router.post('/runlist/upload', upload.single('file'), async (req, res) => {
  try {
    const { auction_name, auction_date } = req.body;
    const file = req.file;
    
    if (!file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }
    
    if (!auction_name) {
      return res.status(400).json({ error: 'auction_name is required' });
    }
    
    if (!auction_date) {
      return res.status(400).json({ error: 'auction_date is required' });
    }
    
    // Parse CSV
    let vehicles;
    try {
      vehicles = parseRunlist(file.path, auction_name);
    } catch (parseErr) {
      return res.status(400).json({ 
        error: parseErr.message,
        hint: 'This auction format is not yet configured. Supported: ' + getSupportedAuctions().join(', ')
      });
    }
    
    if (vehicles.length === 0) {
      return res.status(400).json({ error: 'No valid vehicles found in CSV' });
    }
    
    // Create runlist record
    const runlistResult = await pool.query(`
      INSERT INTO runlists (name, auction_name, auction_date, uploaded_by, total_vehicles, status)
      VALUES ($1, $2, $3, $4, $5, 'processing')
      RETURNING id, name, auction_name, auction_date, uploaded_at
    `, [file.originalname, auction_name, auction_date, 'api_user', vehicles.length]);
    
    const runlistId = runlistResult.rows[0].id;
    
    // Insert vehicles
    for (const vehicle of vehicles) {
      await pool.query(`
        INSERT INTO runlist_vehicles (
          runlist_id, vin, year, make, model, style, mileage,
          lane, lot, run_number, stock_number, exterior_color,
          has_condition_report, grade
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      `, [
        runlistId, vehicle.vin, vehicle.year, vehicle.make, vehicle.model,
        vehicle.style, vehicle.mileage, vehicle.lane, vehicle.lot,
        vehicle.run_number, vehicle.stock_number, vehicle.exterior_color,
        vehicle.has_condition_report, vehicle.grade
      ]);
    }
    
    // Start matching process (async)
    matchRunlist(runlistId).catch(err => {
      console.error('Matching error:', err);
    });
    
    res.json({ 
      success: true,
      runlist: runlistResult.rows[0],
      message: `Uploaded ${vehicles.length} vehicles. Matching against historical data...`,
      next_step: `GET /api/runlist/${runlistId} to view results`
    });
  } catch (err) {
    console.error('Upload error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Get runlist with matched vehicles
router.get('/runlist/:id', async (req, res) => {
  try {
    const runlistId = req.params.id;
    
    const runlist = await pool.query(`
      SELECT * FROM runlists WHERE id = $1
    `, [runlistId]);
    
    if (runlist.rows.length === 0) {
      return res.status(404).json({ error: 'Runlist not found' });
    }
    
    const vehicles = await pool.query(`
      SELECT 
        id, vin, year, make, model, style, mileage,
        lane, lot, run_number, stock_number, exterior_color,
        has_condition_report, grade,
        matched, match_count, last_sold_date, needs_scraping
      FROM runlist_vehicles 
      WHERE runlist_id = $1 
      ORDER BY 
        matched DESC,
        match_count DESC,
        lane, lot
    `, [runlistId]);
    
    // Group by match strength
    const matched = vehicles.rows.filter(v => v.matched);
    const unmatched = vehicles.rows.filter(v => !v.matched);
    
    res.json({
      runlist: runlist.rows[0],
      vehicles: vehicles.rows,
      stats: {
        total: vehicles.rows.length,
        matched: matched.length,
        unmatched: unmatched.length,
        needs_scraping: vehicles.rows.filter(v => v.needs_scraping).length
      },
      summary: {
        matched: matched.slice(0, 10), // Top 10 matches
        unmatched_sample: unmatched.slice(0, 5)
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get all runlists
router.get('/runlists', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT * FROM runlists 
      ORDER BY uploaded_at DESC
    `);
    
    res.json({ runlists: result.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
