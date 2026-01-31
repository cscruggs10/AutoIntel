#!/usr/bin/env node
import pg from 'pg';
import { parse } from 'csv-parse/sync';
import fs from 'fs';
import 'dotenv/config';

const { Pool } = pg;

// Database connection - use DATABASE_URL from environment
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// Check if VIN already scraped
async function isVinScraped(vin, auctionName) {
  const result = await pool.query(
    'SELECT 1 FROM vehicles WHERE vin = $1 AND auction_name = $2',
    [vin, auctionName]
  );
  return result.rows.length > 0;
}

// Store vehicle data
async function storeVehicle(vin, auctionName, crScore, rawAnnouncements) {
  await pool.query(
    `INSERT INTO vehicles (vin, auction_name, cr_score, raw_announcements) 
     VALUES ($1, $2, $3, $4) 
     ON CONFLICT (vin, auction_name) DO UPDATE 
     SET cr_score = $3, raw_announcements = $4, scraped_at = CURRENT_TIMESTAMP`,
    [vin, auctionName, crScore, rawAnnouncements]
  );
  
  // Parse announcements and store them
  if (rawAnnouncements) {
    const announcements = rawAnnouncements.split('|').map(a => a.trim()).filter(Boolean);
    for (const announcement of announcements) {
      // Add to announcements catalog if new
      const result = await pool.query(
        `INSERT INTO announcements (announcement_text, auction_name) 
         VALUES ($1, $2) 
         ON CONFLICT (announcement_text) DO NOTHING 
         RETURNING id`,
        [announcement, auctionName]
      );
      
      // If it was inserted, get the ID; otherwise fetch it
      let announcementId;
      if (result.rows.length > 0) {
        announcementId = result.rows[0].id;
      } else {
        const existing = await pool.query(
          'SELECT id FROM announcements WHERE announcement_text = $1',
          [announcement]
        );
        announcementId = existing.rows[0].id;
      }
      
      // Link vehicle to announcement
      await pool.query(
        `INSERT INTO vehicle_announcements (vin, announcement_id) 
         VALUES ($1, $2) 
         ON CONFLICT DO NOTHING`,
        [vin, announcementId]
      );
    }
  }
}

// Load runlist CSV
export function loadRunlist(csvPath) {
  const content = fs.readFileSync(csvPath, 'utf-8');
  const records = parse(content, {
    columns: true,
    skip_empty_lines: true,
    trim: true
  });
  return records;
}

// Main scraping function (to be called by the agent)
export async function scrapeVehicles(vehicles, auctionName) {
  console.log(`Processing ${vehicles.length} vehicles for auction: ${auctionName}`);
  
  const toScrape = [];
  for (const vehicle of vehicles) {
    const vin = vehicle.VIN || vehicle.vin;
    if (!vin) continue;
    
    const already = await isVinScraped(vin, auctionName);
    if (already) {
      console.log(`Skipping ${vin} - already scraped`);
      continue;
    }
    toScrape.push(vin);
  }
  
  console.log(`Need to scrape ${toScrape.length} new VINs`);
  return toScrape;
}

// Export for use in agent
export { pool, storeVehicle };
