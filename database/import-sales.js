#!/usr/bin/env node
require('dotenv').config();
const fs = require('fs');
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

function parsePrice(str) {
  if (!str) return null;
  return parseFloat(str.replace(/[,$"]/g, '')) || null;
}

function parseDate(str) {
  if (!str) return null;
  try {
    const date = new Date(str);
    return isNaN(date) ? null : date.toISOString().split('T')[0];
  } catch {
    return null;
  }
}

async function importSales() {
  const csvContent = fs.readFileSync('./sales-data.csv', 'utf-8');
  const lines = csvContent.split('\n').slice(1); // Skip header
  
  let imported = 0;
  let errors = 0;
  
  for (const line of lines) {
    if (!line.trim()) continue;
    
    // Parse CSV (basic - could use csv-parser for complex cases)
    const cols = line.split(',');
    
    if (cols.length < 10 || !cols[4]) continue; // Must have VIN
    
    const data = {
      date_sold: parseDate(cols[0]),
      primary_name: cols[1]?.replace(/"/g, ''),
      stock_nbr: cols[2]?.replace(/"/g, ''),
      vin: cols[4]?.replace(/"/g, '').trim(),
      year: parseInt(cols[8]) || null,
      make: cols[9]?.replace(/"/g, ''),
      model: cols[10]?.replace(/"/g, ''),
      purchase_price: parsePrice(cols[11]),
      total_repairs: parsePrice(cols[12]),
      total_cost: parsePrice(cols[14]),
      sales_price: parsePrice(cols[16]),
      gross_profit: parsePrice(cols[22]),
      net_profit: parsePrice(cols[36]),
      days_to_sell: parseInt(cols[7]) || null,
      location: cols[6]?.replace(/"/g, ''),
      purchased_from: cols[51]?.replace(/"/g, '')
    };
    
    if (!data.vin || data.vin.length < 10) {
      errors++;
      continue;
    }
    
    try {
      await pool.query(`
        INSERT INTO historical_sales (
          date_sold, primary_name, stock_nbr, vin, year, make, model,
          purchase_price, total_repairs, total_cost, sales_price,
          gross_profit, net_profit, days_to_sell, location, purchased_from
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
      `, [
        data.date_sold, data.primary_name, data.stock_nbr, data.vin,
        data.year, data.make, data.model, data.purchase_price,
        data.total_repairs, data.total_cost, data.sales_price,
        data.gross_profit, data.net_profit, data.days_to_sell,
        data.location, data.purchased_from
      ]);
      
      imported++;
      
      if (imported % 100 === 0) {
        console.log(`Imported ${imported} records...`);
      }
    } catch (err) {
      errors++;
      if (errors < 10) {
        console.error(`Error importing VIN ${data.vin}:`, err.message);
      }
    }
  }
  
  console.log(`\n✅ Import complete!`);
  console.log(`   Imported: ${imported}`);
  console.log(`   Errors: ${errors}`);
  
  await pool.end();
}

importSales().catch(console.error);
