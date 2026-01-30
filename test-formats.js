#!/usr/bin/env node
require('dotenv').config();
const { parseRunlist, getSupportedAuctions, detectFormatGroup } = require('./lib/runlist-parser');
const { matchRunlist } = require('./lib/matcher');
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

async function testFormat(csvFile, auctionName) {
  console.log(`\n${'='.repeat(70)}`);
  console.log(`🧪 Testing: ${auctionName}`);
  console.log(`${'='.repeat(70)}\n`);
  
  try {
    // 1. Detect format group
    const formatGroup = detectFormatGroup(auctionName);
    console.log(`📋 Format Group: ${formatGroup || 'UNKNOWN'}\n`);
    
    // 2. Parse CSV
    console.log('📄 Parsing CSV...');
    const vehicles = parseRunlist(csvFile, auctionName);
    console.log(`   ✅ Parsed ${vehicles.length} vehicles\n`);
    
    // Show sample vehicle
    console.log('   Sample vehicle:');
    console.log('   ────────────────────────────────────────');
    const sample = vehicles[0];
    Object.keys(sample).forEach(key => {
      if (sample[key]) {
        console.log(`   ${key}: ${sample[key]}`);
      }
    });
    console.log('');
    
    // 3. Create runlist
    console.log('📋 Creating runlist record...');
    const runlistResult = await pool.query(`
      INSERT INTO runlists (name, auction_name, auction_date, uploaded_by, total_vehicles, status)
      VALUES ($1, $2, $3, $4, $5, 'processing')
      RETURNING id, name, auction_name
    `, [csvFile, auctionName, '2026-02-05', 'test', vehicles.length]);
    
    const runlistId = runlistResult.rows[0].id;
    console.log(`   ✅ Created runlist #${runlistId}\n`);
    
    // 4. Insert vehicles
    console.log('🚗 Inserting vehicles...');
    for (const vehicle of vehicles) {
      await pool.query(`
        INSERT INTO runlist_vehicles (
          runlist_id, vin, year, make, model, style, mileage,
          lane, lot, run_number, stock_number, exterior_color,
          interior_color, has_condition_report, grade, mmr_value
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
      `, [
        runlistId, vehicle.vin, vehicle.year, vehicle.make, vehicle.model,
        vehicle.style, vehicle.mileage, vehicle.lane, vehicle.lot,
        vehicle.run_number, vehicle.stock_number, vehicle.exterior_color,
        vehicle.interior_color, vehicle.has_condition_report || false,
        vehicle.grade, vehicle.mmr_value
      ]);
    }
    console.log(`   ✅ Inserted ${vehicles.length} vehicles\n`);
    
    // 5. Run matching
    console.log('🔍 Matching against historical data...');
    const matchResults = await matchRunlist(runlistId);
    console.log(`   ✅ Matched ${matchResults.matched} / ${matchResults.total} vehicles\n`);
    
    // 6. Show top matches
    console.log('📊 Top Matches:\n');
    const matches = await pool.query(`
      SELECT 
        lane, lot, year, make, model, mileage, mmr_value, grade,
        matched, match_count, last_sold_date
      FROM runlist_vehicles
      WHERE runlist_id = $1
      ORDER BY matched DESC, match_count DESC
      LIMIT 5
    `, [runlistId]);
    
    console.log('   ════════════════════════════════════════════════════════════════');
    for (const match of matches.rows) {
      const status = match.matched ? '✅' : '❌';
      const count = match.matched ? `(${match.match_count} matches)` : '(no match)';
      const mmr = match.mmr_value ? `MMR: $${match.mmr_value.toLocaleString()}` : '';
      const grade = match.grade ? `Grade: ${match.grade}` : '';
      console.log(`   ${status} ${match.lane}-${match.lot || match.run_number}: ${match.year} ${match.make} ${match.model}`);
      console.log(`      ${count} ${mmr} ${grade}`);
    }
    
    console.log(`\n✅ Test complete for ${auctionName}!`);
    return runlistId;
    
  } catch (err) {
    console.error('❌ Error:', err.message);
    throw err;
  }
}

async function main() {
  try {
    console.log('\n🎯 AutoIntel Format Testing\n');
    
    // Show supported formats
    const formats = getSupportedAuctions();
    console.log('📋 Supported Format Groups:');
    formats.forEach(f => {
      console.log(`   • ${f.group}: ${f.description}`);
    });
    
    // Test Edge Pipeline format
    await testFormat(
      './sample-runlist.csv',
      'Americas Auto Auction - Atlanta Cartersville, GA'
    );
    
    // Test Manheim format
    await testFormat(
      './sample-manheim.csv',
      'Manheim Little Rock'
    );
    
    console.log('\n🎉 All format tests passed!\n');
    
    await pool.end();
  } catch (err) {
    console.error('\n❌ Test failed:', err.message);
    console.error(err.stack);
    process.exit(1);
  }
}

main();
