#!/usr/bin/env node
require('dotenv').config();
const { parseRunlist } = require('./lib/runlist-parser');
const { matchRunlist } = require('./lib/matcher');
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

async function testUpload() {
  try {
    console.log('🧪 Testing runlist upload and matching...\n');
    
    // 1. Parse CSV
    console.log('📄 Parsing sample-runlist.csv...');
    const vehicles = parseRunlist(
      './sample-runlist.csv',
      'Americas Auto Auction - Atlanta Cartersville, GA'
    );
    console.log(`   ✅ Parsed ${vehicles.length} vehicles\n`);
    
    // 2. Create runlist
    console.log('📋 Creating runlist record...');
    const runlistResult = await pool.query(`
      INSERT INTO runlists (name, auction_name, auction_date, uploaded_by, total_vehicles, status)
      VALUES ($1, $2, $3, $4, $5, 'processing')
      RETURNING id, name, auction_name
    `, ['sample-runlist.csv', 'Americas Auto Auction - Atlanta Cartersville, GA', '2026-01-30', 'test', vehicles.length]);
    
    const runlistId = runlistResult.rows[0].id;
    console.log(`   ✅ Created runlist #${runlistId}\n`);
    
    // 3. Insert vehicles
    console.log('🚗 Inserting vehicles...');
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
    console.log(`   ✅ Inserted ${vehicles.length} vehicles\n`);
    
    // 4. Run matching
    console.log('🔍 Matching against historical data...');
    const matchResults = await matchRunlist(runlistId);
    console.log(`   ✅ Matched ${matchResults.matched} / ${matchResults.total} vehicles\n`);
    
    // 5. Show results
    console.log('📊 Match Results:\n');
    const matches = await pool.query(`
      SELECT 
        lane, lot, year, make, model, 
        matched, match_count, last_sold_date
      FROM runlist_vehicles
      WHERE runlist_id = $1
      ORDER BY matched DESC, match_count DESC
      LIMIT 10
    `, [runlistId]);
    
    console.log('   Top Matches:');
    console.log('   ════════════════════════════════════════════════════════════════');
    for (const match of matches.rows) {
      const status = match.matched ? '✅' : '❌';
      const count = match.matched ? `(${match.match_count} matches)` : '(no match)';
      const lastSold = match.last_sold_date ? `Last sold: ${match.last_sold_date}` : '';
      console.log(`   ${status} ${match.lane}-${match.lot}: ${match.year} ${match.make} ${match.model} ${count} ${lastSold}`);
    }
    
    console.log('\n✅ Test complete!');
    console.log(`\n💡 View full results: GET /api/runlist/${runlistId}`);
    
    await pool.end();
  } catch (err) {
    console.error('❌ Error:', err.message);
    console.error(err.stack);
    process.exit(1);
  }
}

testUpload();
