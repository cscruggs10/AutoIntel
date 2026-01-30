const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

/**
 * Find similar vehicles in historical sales data
 * @param {Object} vehicle - { year, make, model }
 * @returns {Object} - { matched, count, avg_profit, avg_days_to_sell, examples }
 */
async function findSimilarVehicles(vehicle) {
  const { year, make, model } = vehicle;
  
  if (!year || !make || !model) {
    return { matched: false, count: 0 };
  }
  
  // Match on exact year +/- 2 years, same make/model
  const result = await pool.query(`
    SELECT 
      COUNT(*) as count,
      AVG(gross_profit) as avg_profit,
      AVG(net_profit) as avg_net_profit,
      AVG(days_to_sell) as avg_days,
      MIN(purchase_price) as min_purchase,
      MAX(purchase_price) as max_purchase,
      AVG(purchase_price) as avg_purchase,
      MIN(sales_price) as min_sale,
      MAX(sales_price) as max_sale,
      AVG(sales_price) as avg_sale
    FROM historical_sales
    WHERE 
      year BETWEEN $1 - 2 AND $1 + 2
      AND LOWER(make) = LOWER($2)
      AND LOWER(model) = LOWER($3)
  `, [year, make, model]);
  
  const stats = result.rows[0];
  const count = parseInt(stats.count) || 0;
  
  if (count === 0) {
    return { matched: false, count: 0 };
  }
  
  // Get a few examples
  const examples = await pool.query(`
    SELECT 
      vin, year, make, model, date_sold,
      purchase_price, sales_price, gross_profit, net_profit, days_to_sell
    FROM historical_sales
    WHERE 
      year BETWEEN $1 - 2 AND $1 + 2
      AND LOWER(make) = LOWER($2)
      AND LOWER(model) = LOWER($3)
    ORDER BY gross_profit DESC
    LIMIT 5
  `, [year, make, model]);
  
  return {
    matched: true,
    count,
    avg_profit: parseFloat(stats.avg_profit) || 0,
    avg_net_profit: parseFloat(stats.avg_net_profit) || 0,
    avg_days_to_sell: parseInt(stats.avg_days) || 0,
    price_range: {
      purchase: {
        min: parseFloat(stats.min_purchase),
        max: parseFloat(stats.max_purchase),
        avg: parseFloat(stats.avg_purchase)
      },
      sale: {
        min: parseFloat(stats.min_sale),
        max: parseFloat(stats.max_sale),
        avg: parseFloat(stats.avg_sale)
      }
    },
    examples: examples.rows
  };
}

/**
 * Process a runlist - match all vehicles against historical data
 */
async function matchRunlist(runlistId) {
  const vehicles = await pool.query(`
    SELECT id, year, make, model, vin
    FROM runlist_vehicles
    WHERE runlist_id = $1 AND matched = FALSE
  `, [runlistId]);
  
  let matchedCount = 0;
  
  for (const vehicle of vehicles.rows) {
    const match = await findSimilarVehicles(vehicle);
    
    if (match.matched) {
      await pool.query(`
        UPDATE runlist_vehicles
        SET 
          matched = TRUE,
          match_count = $1,
          avg_profit = $2,
          avg_days_to_sell = $3
        WHERE id = $4
      `, [match.count, match.avg_profit, match.avg_days_to_sell, vehicle.id]);
      
      matchedCount++;
    }
  }
  
  // Update runlist stats
  await pool.query(`
    UPDATE runlists
    SET 
      matched_vehicles = $1,
      status = 'matched'
    WHERE id = $2
  `, [matchedCount, runlistId]);
  
  return matchedCount;
}

module.exports = {
  findSimilarVehicles,
  matchRunlist,
  pool
};
