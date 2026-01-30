#!/usr/bin/env node
/**
 * AutoNiq Announcement Scraper
 * 
 * Uses Clawdbot browser relay to extract announcement data from AutoNiq
 * for VINs in a runlist CSV.
 */

import { loadRunlist, storeVehicle, pool } from './scraper.js';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

const AUTONIQ_BASE = 'https://autoniq.com/app/';
const DELAY_MIN_MS = 3000;  // 3 seconds
const DELAY_MAX_MS = 8000;  // 8 seconds

// Random delay to avoid detection
function randomDelay() {
  const delay = Math.floor(Math.random() * (DELAY_MAX_MS - DELAY_MIN_MS + 1)) + DELAY_MIN_MS;
  return new Promise(resolve => setTimeout(resolve, delay));
}

// Call Clawdbot browser tool via exec (since we're running as a script)
async function browserCommand(action, params = {}) {
  const cmd = `clawdbot browser ${action} --profile=chrome ${Object.entries(params).map(([k,v]) => `--${k}="${v}"`).join(' ')}`;
  const { stdout, stderr } = await execAsync(cmd);
  if (stderr && !stderr.includes('Warning')) {
    console.error('Browser error:', stderr);
  }
  return JSON.parse(stdout);
}

// Navigate to VIN in AutoNiq
async function lookupVIN(targetId, vin) {
  console.log(`Looking up VIN: ${vin}`);
  
  // Direct URL navigation - AutoNiq supports direct VIN URLs
  const url = `https://autoniq.com/app/evaluator/vin/${vin}`;
  await browserCommand('navigate', { targetId, targetUrl: url });
  
  await randomDelay();
  
  return targetId;
}

// Extract announcement data from AutoNiq page
async function extractAnnouncements(targetId) {
  // Take snapshot of current page
  const snapshot = await browserCommand('snapshot', { targetId });
  
  // Convert snapshot to text for parsing
  const snapshotText = JSON.stringify(snapshot);
  
  // Pattern: "9:0547, Grade: 1.8 AS IS; INOP"
  const gradePattern = /Grade:\s*([\d.]+)\s+([^"\\]+)/;
  const match = snapshotText.match(gradePattern);
  
  if (!match) {
    return {
      grade: null,
      announcements: []
    };
  }
  
  const grade = parseFloat(match[1]);
  const announcementText = match[2].trim();
  
  // Split by semicolon
  const announcements = announcementText
    .split(';')
    .map(a => a.trim())
    .filter(Boolean);
  
  return {
    grade,
    announcements
  };
}

// Main scraping function
async function scrapeRunlist(csvPath, auctionName) {
  console.log(`\n=== AutoNiq Announcement Scraper ===`);
  console.log(`Runlist: ${csvPath}`);
  console.log(`Auction: ${auctionName}\n`);
  
  // Load runlist
  const vehicles = loadRunlist(csvPath);
  console.log(`Loaded ${vehicles.length} vehicles from runlist`);
  
  // Get browser status
  const status = await browserCommand('status');
  if (!status.running) {
    console.error('Browser relay not connected. Please attach a Chrome tab.');
    process.exit(1);
  }
  
  // Get active tab
  const tabs = await browserCommand('tabs');
  if (!tabs.tabs || tabs.tabs.length === 0) {
    console.error('No browser tab attached. Please click the Browser Relay icon in Chrome.');
    process.exit(1);
  }
  
  const targetId = tabs.tabs[0].targetId;
  console.log(`Using browser tab: ${tabs.tabs[0].title}\n`);
  
  // Navigate to AutoNiq
  console.log('Navigating to AutoNiq...');
  await browserCommand('navigate', { targetId, targetUrl: AUTONIQ_BASE });
  await randomDelay();
  
  // Process each VIN
  let processed = 0;
  let errors = 0;
  
  for (const vehicle of vehicles) {
    const vin = vehicle.Vin || vehicle.VIN;
    if (!vin) {
      console.log('Skipping vehicle with no VIN');
      continue;
    }
    
    try {
      // Check if already scraped
      const existing = await pool.query(
        'SELECT 1 FROM vehicles WHERE vin = $1 AND auction_name = $2',
        [vin, auctionName]
      );
      
      if (existing.rows.length > 0) {
        console.log(`✓ ${vin} - already scraped`);
        continue;
      }
      
      // Navigate to VIN
      await lookupVIN(targetId, vin);
      
      // Extract announcement data
      const data = await extractAnnouncements(targetId);
      
      // Store in database
      const rawAnnouncements = data.announcements.join('|');
      await storeVehicle(vin, auctionName, data.grade, rawAnnouncements);
      
      processed++;
      console.log(`✓ ${vin} - ${data.announcements.length} announcements found`);
      
    } catch (error) {
      errors++;
      console.error(`✗ ${vin} - Error: ${error.message}`);
    }
    
    // Rate limiting
    await randomDelay();
  }
  
  console.log(`\n=== Scraping Complete ===`);
  console.log(`Processed: ${processed}`);
  console.log(`Errors: ${errors}`);
  console.log(`Total: ${vehicles.length}`);
}

// CLI
const args = process.argv.slice(2);
if (args.length < 2) {
  console.log('Usage: node autoniq-scraper.js <runlist.csv> <auction-name>');
  console.log('Example: node autoniq-scraper.js test-runlist.csv "United Auto Exchange Memphis"');
  process.exit(1);
}

const [csvPath, auctionName] = args;
scrapeRunlist(csvPath, auctionName)
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
