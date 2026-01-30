#!/usr/bin/env node
require('dotenv').config();
const fs = require('fs');
const { parse } = require('csv-parse/sync');
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
  
  // Parse CSV properly with csv-parse
  const records = parse(csvContent, {
    columns: true,
    skip_empty_lines: true,
    relax_quotes: true
  });
  
  let imported = 0;
  let updated = 0;
  let errors = 0;
  
  for (const record of records) {
    const cols = Object.values(record);
    
    if (cols.length < 10 || !cols[4]) continue; // Must have VIN
    
    const data = {
      // Core identifiers
      date_sold: parseDate(cols[0]),
      posting_date: parseDate(cols[3]),
      stock_nbr: cols[2]?.replace(/"/g, ''),
      vin: cols[4]?.replace(/"/g, '').trim(),
      stock_date: parseDate(cols[60]),
      
      // Vehicle info
      year: parseInt(cols[8]) || null,
      make: cols[9]?.replace(/"/g, ''),
      model: cols[10]?.replace(/"/g, ''),
      book_value: parsePrice(cols[68]),
      
      // Purchase/cost info
      purchase_price: parsePrice(cols[11]),
      total_repairs: parsePrice(cols[12]),
      finder_fee: parsePrice(cols[13]),
      after_sale_repairs: parsePrice(cols[55]),
      total_cost: parsePrice(cols[14]),
      
      // Sales info
      sales_price: parsePrice(cols[16]),
      doc_fee: parsePrice(cols[17]),
      sales_commission: parsePrice(cols[21]),
      sales_tax_amt: parsePrice(cols[25]),
      sales_type: cols[38]?.replace(/"/g, ''),
      
      // Profitability
      gross_profit: parsePrice(cols[22]),
      net_profit: parsePrice(cols[36]),
      
      // Financing
      original_balance: parsePrice(cols[15]),
      balance_remaining: parsePrice(cols[37]),
      amount_financed: parsePrice(cols[41]),
      apr: parsePrice(cols[49]),
      credit_score: parseInt(cols[50]) || null,
      
      // Trade info
      total_trade_acv: parsePrice(cols[26]),
      trade_amount: parsePrice(cols[27]),
      
      // Operational
      days_to_sell: parseInt(cols[7]) || null,
      location: cols[6]?.replace(/"/g, ''),
      branch_nbr: cols[5]?.replace(/"/g, ''),
      purchased_from: cols[52]?.replace(/"/g, ''),
      primary_name: cols[1]?.replace(/"/g, ''),
      finder_name: cols[61]?.replace(/"/g, ''),
      salesman_code: cols[28]?.replace(/"/g, ''),
      class: cols[48]?.replace(/"/g, '')
    };
    
    if (!data.vin || data.vin.length < 10) {
      errors++;
      continue;
    }
    
    try {
      // Upsert: Insert or update if VIN + stock_nbr combo exists
      const result = await pool.query(`
        INSERT INTO historical_sales (
          date_sold, posting_date, stock_nbr, vin, stock_date,
          year, make, model, book_value,
          purchase_price, total_repairs, finder_fee, after_sale_repairs, total_cost,
          sales_price, doc_fee, sales_commission, sales_tax_amt, sales_type,
          gross_profit, net_profit,
          original_balance, balance_remaining, amount_financed, apr, credit_score,
          total_trade_acv, trade_amount,
          days_to_sell, location, branch_nbr, purchased_from, primary_name,
          finder_name, salesman_code, class
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31, $32, $33, $34, $35, $36)
        ON CONFLICT (vin, stock_nbr) 
        DO UPDATE SET
          date_sold = EXCLUDED.date_sold,
          posting_date = EXCLUDED.posting_date,
          stock_date = EXCLUDED.stock_date,
          year = EXCLUDED.year,
          make = EXCLUDED.make,
          model = EXCLUDED.model,
          book_value = EXCLUDED.book_value,
          purchase_price = EXCLUDED.purchase_price,
          total_repairs = EXCLUDED.total_repairs,
          finder_fee = EXCLUDED.finder_fee,
          after_sale_repairs = EXCLUDED.after_sale_repairs,
          total_cost = EXCLUDED.total_cost,
          sales_price = EXCLUDED.sales_price,
          doc_fee = EXCLUDED.doc_fee,
          sales_commission = EXCLUDED.sales_commission,
          sales_tax_amt = EXCLUDED.sales_tax_amt,
          sales_type = EXCLUDED.sales_type,
          gross_profit = EXCLUDED.gross_profit,
          net_profit = EXCLUDED.net_profit,
          original_balance = EXCLUDED.original_balance,
          balance_remaining = EXCLUDED.balance_remaining,
          amount_financed = EXCLUDED.amount_financed,
          apr = EXCLUDED.apr,
          credit_score = EXCLUDED.credit_score,
          total_trade_acv = EXCLUDED.total_trade_acv,
          trade_amount = EXCLUDED.trade_amount,
          days_to_sell = EXCLUDED.days_to_sell,
          location = EXCLUDED.location,
          branch_nbr = EXCLUDED.branch_nbr,
          purchased_from = EXCLUDED.purchased_from,
          primary_name = EXCLUDED.primary_name,
          finder_name = EXCLUDED.finder_name,
          salesman_code = EXCLUDED.salesman_code,
          class = EXCLUDED.class
        RETURNING (xmax = 0) AS inserted
      `, [
        data.date_sold, data.posting_date, data.stock_nbr, data.vin, data.stock_date,
        data.year, data.make, data.model, data.book_value,
        data.purchase_price, data.total_repairs, data.finder_fee, data.after_sale_repairs, data.total_cost,
        data.sales_price, data.doc_fee, data.sales_commission, data.sales_tax_amt, data.sales_type,
        data.gross_profit, data.net_profit,
        data.original_balance, data.balance_remaining, data.amount_financed, data.apr, data.credit_score,
        data.total_trade_acv, data.trade_amount,
        data.days_to_sell, data.location, data.branch_nbr, data.purchased_from, data.primary_name,
        data.finder_name, data.salesman_code, data.class
      ]);
      
      if (result.rows[0].inserted) {
        imported++;
      } else {
        updated++;
      }
      
      if ((imported + updated) % 100 === 0) {
        console.log(`Processed ${imported + updated} records (${imported} new, ${updated} updated)...`);
      }
    } catch (err) {
      errors++;
      if (errors < 10) {
        console.error(`Error importing VIN ${data.vin}:`, err.message);
      }
    }
  }
  
  console.log(`\n✅ Import complete!`);
  console.log(`   New records: ${imported}`);
  console.log(`   Updated: ${updated}`);
  console.log(`   Errors: ${errors}`);
  
  await pool.end();
}

importSales().catch(console.error);
