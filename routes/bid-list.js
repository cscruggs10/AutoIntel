const express = require('express');
const { Pool } = require('pg');
const router = express.Router();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

// Get user ID (for now, always return default user - can be expanded later with auth)
function getUserId(req) {
  // TODO: Replace with actual session/auth when implemented
  return 1; // Default user ID
}

// Add or update bid list entry
router.post('/add', async (req, res) => {
  try {
    const { vehicle_id, auction_id, bid_type, max_bid } = req.body;
    const user_id = getUserId(req);

    if (!vehicle_id || !auction_id || !bid_type) {
      return res.status(400).json({ 
        error: 'vehicle_id, auction_id, and bid_type are required' 
      });
    }

    if (!['in-lane', 'proxy', 'pass'].includes(bid_type)) {
      return res.status(400).json({ 
        error: 'bid_type must be one of: in-lane, proxy, pass' 
      });
    }

    // Validate max_bid for proxy type
    if (bid_type === 'proxy' && (!max_bid || max_bid <= 0)) {
      return res.status(400).json({ 
        error: 'max_bid is required and must be greater than 0 for proxy bids' 
      });
    }

    const result = await pool.query(`
      INSERT INTO bid_list (user_id, vehicle_id, auction_id, bid_type, max_bid, created_by)
      VALUES ($1, $2, $3, $4, $5, $1)
      ON CONFLICT (user_id, vehicle_id, auction_id) DO UPDATE SET
        bid_type = $4,
        max_bid = $5,
        updated_at = CURRENT_TIMESTAMP
      RETURNING *
    `, [user_id, vehicle_id, auction_id, bid_type, max_bid]);

    res.json({
      success: true,
      bid: result.rows[0]
    });
  } catch (err) {
    console.error('Add bid error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Remove from bid list
router.delete('/:id', async (req, res) => {
  try {
    const bidId = req.params.id;
    const user_id = getUserId(req);

    const result = await pool.query(`
      DELETE FROM bid_list 
      WHERE id = $1 AND user_id = $2
      RETURNING *
    `, [bidId, user_id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Bid not found' });
    }

    res.json({
      success: true,
      deleted: result.rows[0]
    });
  } catch (err) {
    console.error('Delete bid error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Get bid status for vehicles in a runlist
router.get('/runlist/:runlist_id', async (req, res) => {
  try {
    const runlist_id = req.params.runlist_id;
    const user_id = getUserId(req);

    const result = await pool.query(`
      SELECT
        bl.id,
        bl.vehicle_id,
        bl.bid_type,
        bl.max_bid,
        bl.created_at,
        u.name as created_by_name
      FROM bid_list bl
      JOIN users u ON bl.created_by = u.id
      WHERE bl.auction_id = $1 AND bl.user_id = $2
    `, [runlist_id, user_id]);

    // Return array of bids (calendar expects this format)
    const bids = result.rows.map(bid => ({
      id: bid.id,
      vehicle_id: bid.vehicle_id,
      bid_type: bid.bid_type,
      max_bid: bid.max_bid,
      created_by: bid.created_by_name,
      created_at: bid.created_at
    }));

    res.json({
      runlist_id,
      bids
    });
  } catch (err) {
    console.error('Get runlist bids error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Get In-Lane Dashboard (grouped by auction, sorted by lane/run)
router.get('/in-lane-dashboard', async (req, res) => {
  try {
    const user_id = getUserId(req);

    const result = await pool.query(`
      SELECT
        r.id as auction_id,
        r.name as auction_name,
        r.auction_name as auction_house,
        r.auction_date,
        rv.id as vehicle_id,
        rv.vin,
        rv.year,
        rv.make,
        rv.model,
        rv.lane,
        rv.lot,
        v.cr_score as grade,
        v.raw_announcements as announcements,
        bl.id as bid_id,
        bl.created_at as added_at,
        u.name as added_by
      FROM bid_list bl
      JOIN runlist_vehicles rv ON bl.vehicle_id = rv.id
      JOIN runlists r ON bl.auction_id = r.id
      JOIN users u ON bl.created_by = u.id
      LEFT JOIN vehicles v ON rv.vin = v.vin
      WHERE bl.user_id = $1 AND bl.bid_type = 'in-lane'
      ORDER BY r.auction_date, r.auction_name, rv.lane, rv.lot
    `, [user_id]);

    // Group by auction
    const auctions = {};
    result.rows.forEach(row => {
      const auctionKey = `${row.auction_id}`;
      if (!auctions[auctionKey]) {
        auctions[auctionKey] = {
          auction_id: row.auction_id,
          auction_name: row.auction_name,
          auction_house: row.auction_house,
          auction_date: row.auction_date,
          vehicles: []
        };
      }
      auctions[auctionKey].vehicles.push({
        vehicle_id: row.vehicle_id,
        bid_id: row.bid_id,
        vin: row.vin,
        year: row.year,
        make: row.make,
        model: row.model,
        lane: row.lane || '-',
        lot: row.lot || '-',
        grade: row.grade || null,
        announcements: row.announcements || '',
        added_by: row.added_by,
        added_at: row.added_at
      });
    });

    res.json({
      auctions: Object.values(auctions),
      total_vehicles: result.rows.length
    });
  } catch (err) {
    console.error('In-lane dashboard error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Get Proxy Dashboard (grouped by auction, sorted by lane/run)
router.get('/proxy-dashboard', async (req, res) => {
  try {
    const user_id = getUserId(req);

    const result = await pool.query(`
      SELECT
        r.id as auction_id,
        r.name as auction_name,
        r.auction_name as auction_house,
        r.auction_date,
        rv.id as vehicle_id,
        rv.vin,
        rv.year,
        rv.make,
        rv.model,
        rv.lane,
        rv.lot,
        v.cr_score as grade,
        v.raw_announcements as announcements,
        bl.id as bid_id,
        bl.max_bid,
        bl.created_at as added_at,
        u.name as added_by
      FROM bid_list bl
      JOIN runlist_vehicles rv ON bl.vehicle_id = rv.id
      JOIN runlists r ON bl.auction_id = r.id
      JOIN users u ON bl.created_by = u.id
      LEFT JOIN vehicles v ON rv.vin = v.vin
      WHERE bl.user_id = $1 AND bl.bid_type = 'proxy'
      ORDER BY r.auction_date, r.auction_name, rv.lane, rv.lot
    `, [user_id]);

    // Group by auction
    const auctions = {};
    result.rows.forEach(row => {
      const auctionKey = `${row.auction_id}`;
      if (!auctions[auctionKey]) {
        auctions[auctionKey] = {
          auction_id: row.auction_id,
          auction_name: row.auction_name,
          auction_house: row.auction_house,
          auction_date: row.auction_date,
          vehicles: []
        };
      }
      auctions[auctionKey].vehicles.push({
        vehicle_id: row.vehicle_id,
        bid_id: row.bid_id,
        vin: row.vin,
        year: row.year,
        make: row.make,
        model: row.model,
        lane: row.lane || '-',
        lot: row.lot || '-',
        grade: row.grade || null,
        announcements: row.announcements || '',
        max_bid: row.max_bid,
        added_by: row.added_by,
        added_at: row.added_at
      });
    });

    res.json({
      auctions: Object.values(auctions),
      total_vehicles: result.rows.length
    });
  } catch (err) {
    console.error('Proxy dashboard error:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
