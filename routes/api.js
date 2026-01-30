const express = require('express');
const multer = require('multer');
const { Pool } = require('pg');
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

// Upload runlist CSV
router.post('/runlist/upload', upload.single('file'), async (req, res) => {
  try {
    const { auction_name, auction_date } = req.body;
    const file = req.file;
    
    if (!file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }
    
    // TODO: Parse CSV and insert vehicles
    // For now, just create the runlist record
    const result = await pool.query(`
      INSERT INTO runlists (name, auction_name, auction_date, uploaded_by, status)
      VALUES ($1, $2, $3, $4, 'uploaded')
      RETURNING id, name, auction_name, uploaded_at
    `, [file.originalname, auction_name, auction_date, 'api_user']);
    
    res.json({ 
      success: true,
      runlist: result.rows[0],
      message: 'CSV parsing and matching coming next!'
    });
  } catch (err) {
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
      SELECT * FROM runlist_vehicles 
      WHERE runlist_id = $1 
      ORDER BY matched DESC, avg_profit DESC
    `, [runlistId]);
    
    res.json({
      runlist: runlist.rows[0],
      vehicles: vehicles.rows,
      stats: {
        total: vehicles.rows.length,
        matched: vehicles.rows.filter(v => v.matched).length,
        unmatched: vehicles.rows.filter(v => !v.matched).length
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
