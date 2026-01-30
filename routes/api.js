const express = require('express');
const multer = require('multer');
const { Pool } = require('pg');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const { parseRunlistWithMappings, REQUIRED_FIELDS, OPTIONAL_FIELDS } = require('../lib/runlist-parser');
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

// Get supported auction formats (from database)
router.get('/auction-formats', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT id, auction_name, column_mappings, created_at
      FROM auction_formats
      ORDER BY auction_name
    `);
    res.json({ formats: result.rows });
  } catch (err) {
    // If table doesn't exist yet, return empty array
    if (err.code === '42P01') {
      return res.json({ formats: [] });
    }
    res.status(500).json({ error: err.message });
  }
});

// Detect columns from uploaded CSV
router.post('/csv/detect-columns', upload.single('file'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const csvContent = fs.readFileSync(req.file.path, 'utf-8');
    const { parse } = require('csv-parse/sync');

    const records = parse(csvContent, {
      columns: true,
      skip_empty_lines: true,
      relax_quotes: true,
      trim: true,
      to: 5 // Only parse first 5 rows for preview
    });

    if (records.length === 0) {
      return res.status(400).json({ error: 'CSV file is empty or invalid' });
    }

    const columns = Object.keys(records[0]);
    const sampleData = records.slice(0, 3);

    // Clean up temp file
    fs.unlink(req.file.path, () => {});

    res.json({
      columns,
      sampleData,
      rowCount: records.length
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Save new auction format
router.post('/auction-formats', async (req, res) => {
  try {
    const { auction_name, column_mappings } = req.body;

    if (!auction_name || !column_mappings) {
      return res.status(400).json({ error: 'auction_name and column_mappings are required' });
    }

    // Validate required fields are mapped
    const required = ['vin', 'year', 'make', 'model'];
    for (const field of required) {
      if (!column_mappings[field]) {
        return res.status(400).json({ error: `Missing required mapping: ${field}` });
      }
    }

    const result = await pool.query(`
      INSERT INTO auction_formats (auction_name, column_mappings)
      VALUES ($1, $2)
      ON CONFLICT (auction_name) DO UPDATE SET
        column_mappings = $2,
        updated_at = CURRENT_TIMESTAMP
      RETURNING id, auction_name, column_mappings, created_at
    `, [auction_name, JSON.stringify(column_mappings)]);

    res.json({
      success: true,
      format: result.rows[0]
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Legacy endpoint - redirect to new one
router.get('/auctions', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT auction_name FROM auction_formats ORDER BY auction_name
    `);
    res.json({ auctions: result.rows.map(r => r.auction_name) });
  } catch (err) {
    res.json({ auctions: [] });
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

    if (!auction_name) {
      return res.status(400).json({ error: 'auction_name is required' });
    }

    if (!auction_date) {
      return res.status(400).json({ error: 'auction_date is required' });
    }

    // Look up auction format from database
    const formatResult = await pool.query(
      'SELECT column_mappings FROM auction_formats WHERE auction_name = $1',
      [auction_name]
    );

    if (formatResult.rows.length === 0) {
      // Clean up temp file
      fs.unlink(file.path, () => {});
      return res.status(400).json({
        error: `Unknown auction format: ${auction_name}`,
        hint: 'Please create this auction format first by mapping its columns.'
      });
    }

    const columnMappings = formatResult.rows[0].column_mappings;

    // Parse CSV using the stored mappings
    let vehicles;
    try {
      vehicles = parseRunlistWithMappings(file.path, columnMappings);
    } catch (parseErr) {
      fs.unlink(file.path, () => {});
      return res.status(400).json({
        error: parseErr.message
      });
    }

    // Clean up temp file
    fs.unlink(file.path, () => {});

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
          runlist_id, vin, year, make, model, mileage,
          lane, lot, run_number, stock_number, exterior_color,
          interior_color, has_condition_report, grade, mmr_value
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
      `, [
        runlistId, vehicle.vin, vehicle.year, vehicle.make, vehicle.model,
        vehicle.mileage, vehicle.lane, vehicle.lot,
        vehicle.run_number, vehicle.stock_number, vehicle.exterior_color,
        vehicle.interior_color, vehicle.has_condition_report || false,
        vehicle.grade, vehicle.mmr_value
      ]);
    }
    
    // Run matching synchronously so results are ready
    const matchResults = await matchRunlist(runlistId);

    res.json({
      success: true,
      runlist: runlistResult.rows[0],
      matchResults,
      message: `Uploaded ${vehicles.length} vehicles. Found ${matchResults.matched} matches.`,
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
        interior_color, has_condition_report, grade, mmr_value,
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

// Scrape matched vehicles for a runlist
router.post('/runlist/:id/scrape', async (req, res) => {
  const runlistId = req.params.id;

  try {
    // Get runlist info
    const runlistResult = await pool.query(
      'SELECT * FROM runlists WHERE id = $1',
      [runlistId]
    );

    if (runlistResult.rows.length === 0) {
      return res.status(404).json({ error: 'Runlist not found' });
    }

    const runlist = runlistResult.rows[0];

    // Get vehicles that need scraping
    const vehiclesResult = await pool.query(`
      SELECT id, vin, year, make, model
      FROM runlist_vehicles
      WHERE runlist_id = $1 AND needs_scraping = true
    `, [runlistId]);

    const vehicles = vehiclesResult.rows;

    if (vehicles.length === 0) {
      return res.status(400).json({ error: 'No vehicles to scrape' });
    }

    // Set headers for Server-Sent Events
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    // Create temp CSV with VINs to scrape
    const tempCsvPath = path.join(__dirname, '..', 'uploads', `scrape-${runlistId}-${Date.now()}.csv`);
    const csvContent = 'Vin,Year,Make,Model\n' +
      vehicles.map(v => `${v.vin},${v.year},${v.make},${v.model}`).join('\n');
    fs.writeFileSync(tempCsvPath, csvContent);

    const auctionName = `${runlist.auction_name} (${runlist.auction_date})`;

    // Spawn scraper process
    const scraperPath = path.join(__dirname, '..', 'auction-scraper', 'autoniq-scraper.js');
    const scraper = spawn('node', [scraperPath, tempCsvPath, auctionName]);

    let processed = 0;
    let errors = 0;
    const total = vehicles.length;
    const startTime = Date.now();

    res.write(`data: ${JSON.stringify({ progress: 0, message: `Starting scrape of ${total} matched vehicles...` })}\n\n`);

    scraper.stdout.on('data', (data) => {
      const text = data.toString();
      console.log(text);

      // Count processed
      if (text.includes('✓') && text.includes('announcements found')) {
        processed++;
        const progress = Math.min(95, Math.floor((processed / total) * 100));
        res.write(`data: ${JSON.stringify({
          progress,
          message: `Scraping: ${processed}/${total} vehicles`
        })}\n\n`);
      }

      if (text.includes('✓') && text.includes('already scraped')) {
        processed++;
        const progress = Math.min(95, Math.floor((processed / total) * 100));
        res.write(`data: ${JSON.stringify({
          progress,
          message: `Scraping: ${processed}/${total} vehicles (cached)`
        })}\n\n`);
      }

      // Count errors
      if (text.includes('✗') && text.includes('Error:')) {
        errors++;
      }

      // Completion
      if (text.includes('=== Scraping Complete ===')) {
        const duration = Math.floor((Date.now() - startTime) / 1000);

        // Update runlist status
        pool.query(
          'UPDATE runlists SET status = $1 WHERE id = $2',
          ['scraped', runlistId]
        ).catch(console.error);

        // Mark vehicles as scraped
        pool.query(
          'UPDATE runlist_vehicles SET needs_scraping = false WHERE runlist_id = $1 AND needs_scraping = true',
          [runlistId]
        ).catch(console.error);

        res.write(`data: ${JSON.stringify({
          progress: 100,
          complete: true,
          processed,
          errors,
          total,
          duration,
          message: 'Scraping complete!'
        })}\n\n`);
      }
    });

    scraper.stderr.on('data', (data) => {
      console.error('Scraper error:', data.toString());
    });

    scraper.on('close', (code) => {
      // Clean up temp file
      fs.unlink(tempCsvPath, () => {});

      if (code !== 0) {
        res.write(`data: ${JSON.stringify({
          error: 'Scraper process exited with code ' + code
        })}\n\n`);
      }
      res.end();
    });

    scraper.on('error', (err) => {
      console.error('Failed to start scraper:', err);
      res.write(`data: ${JSON.stringify({
        error: 'Failed to start scraper: ' + err.message
      })}\n\n`);
      res.end();
    });

  } catch (err) {
    console.error('Scrape error:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
