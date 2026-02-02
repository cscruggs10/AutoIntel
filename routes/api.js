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

// Get scraped vehicle data
router.get('/vehicles', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT vin, auction_name, cr_score, raw_announcements, scraped_at
      FROM vehicles
      ORDER BY scraped_at DESC
      LIMIT 50
    `);
    res.json({ vehicles: result.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Clear all runlist data (for fresh start)
router.post('/clear-runlists', async (req, res) => {
  try {
    await pool.query('DELETE FROM bid_list');
    await pool.query('DELETE FROM runlist_vehicles');
    await pool.query('DELETE FROM runlists');
    await pool.query('DELETE FROM vehicles');

    res.json({ success: true, message: 'All runlist data cleared' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Migrate database - create missing tables for scraper
router.post('/migrate', async (req, res) => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS vehicles (
        id SERIAL PRIMARY KEY,
        vin VARCHAR(17) NOT NULL,
        auction_name VARCHAR(255) NOT NULL,
        cr_score DECIMAL(3,1),
        raw_announcements TEXT,
        scraped_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(vin, auction_name)
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS announcements (
        id SERIAL PRIMARY KEY,
        announcement_text TEXT NOT NULL UNIQUE,
        auction_name VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS vehicle_announcements (
        vin VARCHAR(17) NOT NULL,
        announcement_id INTEGER REFERENCES announcements(id),
        PRIMARY KEY(vin, announcement_id)
      )
    `);

    // Users table (for multi-user support)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        email VARCHAR(255) UNIQUE NOT NULL,
        name VARCHAR(255) NOT NULL,
        password_hash VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Insert default user for single-user mode
    await pool.query(`
      INSERT INTO users (email, name)
      VALUES ('default@autointel.local', 'Default User')
      ON CONFLICT (email) DO NOTHING
    `);

    // Bid List table (combines in-lane, proxy, and pass)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS bid_list (
        id SERIAL PRIMARY KEY,
        user_id INT NOT NULL,
        vehicle_id INT NOT NULL REFERENCES runlist_vehicles(id) ON DELETE CASCADE,
        auction_id INT NOT NULL REFERENCES runlists(id) ON DELETE CASCADE,
        bid_type VARCHAR(20) NOT NULL CHECK (bid_type IN ('in-lane', 'proxy', 'pass')),
        max_bid DECIMAL(10,2),
        created_by INT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, vehicle_id, auction_id)
      )
    `);

    // Indexes for bid_list
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_bid_list_user_auction ON bid_list(user_id, auction_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_bid_list_bid_type ON bid_list(bid_type)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_bid_list_vehicle ON bid_list(vehicle_id)`);

    res.json({ success: true, message: 'Migration complete - all tables created' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

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
          runlist_id, vin, year, make, model, lane, lot
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      `, [
        runlistId, vehicle.vin, vehicle.year, vehicle.make, vehicle.model,
        vehicle.lane, vehicle.lot
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
        id, vin, year, make, model, lane, lot,
        matched, match_count, scraped
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
        needs_scraping: vehicles.rows.filter(v => v.matched && !v.scraped).length
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

// Get enriched runlist data (with scraped announcements)
router.get('/runlist/:id/enriched', async (req, res) => {
  try {
    const runlistId = req.params.id;

    const runlist = await pool.query('SELECT * FROM runlists WHERE id = $1', [runlistId]);
    if (runlist.rows.length === 0) {
      return res.status(404).json({ error: 'Runlist not found' });
    }

    // Join runlist vehicles with scraped data
    const vehicles = await pool.query(`
      SELECT
        rv.id, rv.vin, rv.year, rv.make, rv.model, rv.lane, rv.lot,
        rv.matched, rv.match_count,
        v.cr_score as grade,
        v.raw_announcements as announcements,
        v.scraped_at
      FROM runlist_vehicles rv
      LEFT JOIN vehicles v ON rv.vin = v.vin
      WHERE rv.runlist_id = $1
      ORDER BY
        rv.lane ASC NULLS LAST,
        rv.lot ASC NULLS LAST
    `, [runlistId]);

    // Flag risky vehicles
    const flaggedTerms = ['STRUCTURAL', 'SALVAGE', 'FLOOD', 'FIRE', 'INOP', 'AIRBAG', 'FRAME'];
    const enrichedVehicles = vehicles.rows.map(v => {
      const flags = [];
      if (v.announcements) {
        for (const term of flaggedTerms) {
          if (v.announcements.toUpperCase().includes(term)) {
            flags.push(term);
          }
        }
      }
      return { ...v, flags };
    });

    res.json({
      runlist: runlist.rows[0],
      vehicles: enrichedVehicles,
      stats: {
        total: vehicles.rows.length,
        enriched: vehicles.rows.filter(v => v.grade !== null).length,
        flagged: enrichedVehicles.filter(v => v.flags.length > 0).length
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Export enriched runlist as CSV
router.get('/runlist/:id/export', async (req, res) => {
  try {
    const runlistId = req.params.id;

    const runlist = await pool.query('SELECT * FROM runlists WHERE id = $1', [runlistId]);
    if (runlist.rows.length === 0) {
      return res.status(404).json({ error: 'Runlist not found' });
    }

    const vehicles = await pool.query(`
      SELECT
        rv.vin, rv.year, rv.make, rv.model, rv.lane, rv.lot,
        v.cr_score as grade,
        v.raw_announcements as announcements
      FROM runlist_vehicles rv
      LEFT JOIN vehicles v ON rv.vin = v.vin
      WHERE rv.runlist_id = $1
      ORDER BY rv.lane, rv.lot
    `, [runlistId]);

    // Build CSV
    const headers = ['VIN', 'Year', 'Make', 'Model', 'Lane', 'Lot', 'Grade', 'Announcements'];
    const rows = vehicles.rows.map(v => [
      v.vin,
      v.year || '',
      v.make || '',
      v.model || '',
      v.lane || '',
      v.lot || '',
      v.grade || '',
      (v.announcements || '').replace(/\|/g, '; ')
    ]);

    const csv = [headers.join(','), ...rows.map(r => r.map(c => `"${c}"`).join(','))].join('\n');

    const filename = `${runlist.rows[0].auction_name.replace(/[^a-zA-Z0-9]/g, '-')}-enriched.csv`;
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(csv);
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

// Debug endpoint - compare data formats between historical_sales and runlist_vehicles
router.get('/debug/data-formats', async (req, res) => {
  try {
    // Get sample from historical_sales
    const historicalSample = await pool.query(`
      SELECT DISTINCT make, model, year
      FROM historical_sales
      ORDER BY make, model
      LIMIT 20
    `);

    // Get sample from runlist_vehicles
    const runlistSample = await pool.query(`
      SELECT DISTINCT make, model, year
      FROM runlist_vehicles
      ORDER BY make, model
      LIMIT 20
    `);

    // Get unique makes from both tables
    const historicalMakes = await pool.query(`
      SELECT DISTINCT make FROM historical_sales ORDER BY make
    `);

    const runlistMakes = await pool.query(`
      SELECT DISTINCT make FROM runlist_vehicles ORDER BY make
    `);

    res.json({
      historical_sales: {
        sample: historicalSample.rows,
        unique_makes: historicalMakes.rows.map(r => r.make)
      },
      runlist_vehicles: {
        sample: runlistSample.rows,
        unique_makes: runlistMakes.rows.map(r => r.make)
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Calendar API - Get runlists for next 7 days
router.get('/calendar/week', async (req, res) => {
  try {
    // Always start from today
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const startDate = now.toISOString().split('T')[0];

    // Show 7 days forward (today + 6 more)
    const end = new Date(now);
    end.setDate(end.getDate() + 6);
    const endDate = end.toISOString().split('T')[0];

    const start = now;

    // Get all runlists for this week with vehicle and signal counts
    const runlists = await pool.query(`
      SELECT
        r.id,
        r.auction_name,
        r.auction_date,
        r.name as filename,
        r.status,
        r.total_vehicles,
        r.uploaded_at,
        COUNT(rv.id) as vehicle_count,
        COUNT(CASE WHEN rv.matched THEN 1 END) as matched_count,
        COUNT(CASE WHEN v.cr_score IS NOT NULL THEN 1 END) as enriched_count
      FROM runlists r
      LEFT JOIN runlist_vehicles rv ON r.id = rv.runlist_id
      LEFT JOIN vehicles v ON rv.vin = v.vin
      WHERE r.auction_date >= $1 AND r.auction_date <= $2
      GROUP BY r.id, r.auction_name, r.auction_date, r.name, r.status, r.total_vehicles, r.uploaded_at
      ORDER BY r.auction_date, r.auction_name
    `, [startDate, endDate]);

    // Group by day
    const days = {};
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

    // Initialize all 7 days
    for (let i = 0; i < 7; i++) {
      const d = new Date(start);
      d.setDate(d.getDate() + i);
      const dateStr = d.toISOString().split('T')[0];
      days[dateStr] = {
        date: dateStr,
        dayName: dayNames[d.getDay()],
        dayOfMonth: d.getDate(),
        auctions: [],
        totalVehicles: 0,
        totalSignals: 0
      };
    }

    // Fill in auctions
    for (const r of runlists.rows) {
      const dateStr = r.auction_date.toISOString().split('T')[0];
      if (days[dateStr]) {
        days[dateStr].auctions.push({
          id: r.id,
          auctionName: r.auction_name,
          filename: r.filename,
          status: r.status,
          vehicleCount: parseInt(r.vehicle_count) || parseInt(r.total_vehicles) || 0,
          matchedCount: parseInt(r.matched_count) || 0,
          enrichedCount: parseInt(r.enriched_count) || 0
        });
        days[dateStr].totalVehicles += parseInt(r.vehicle_count) || parseInt(r.total_vehicles) || 0;
        days[dateStr].totalSignals += parseInt(r.matched_count) || 0;
      }
    }

    res.json({
      weekStart: startDate,
      weekEnd: endDate,
      days: Object.values(days)
    });
  } catch (err) {
    console.error('Calendar error:', err);
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
      WHERE runlist_id = $1 AND matched = true AND scraped = false
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
          'UPDATE runlist_vehicles SET scraped = true WHERE runlist_id = $1 AND matched = true',
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
