#!/usr/bin/env node
/**
 * AutoNiq Announcement Scraper
 *
 * Uses Playwright to extract announcement data from AutoNiq
 * for VINs in a runlist CSV.
 */

import { loadRunlist, storeVehicle, pool } from './scraper.js';
import { chromium } from 'playwright';

const AUTONIQ_LOGIN_URL = 'https://autoniq.com/login';
const AUTONIQ_BASE = 'https://autoniq.com/app/';
const DELAY_MIN_MS = 2000;
const DELAY_MAX_MS = 5000;

// Random delay to avoid detection
function randomDelay() {
  const delay = Math.floor(Math.random() * (DELAY_MAX_MS - DELAY_MIN_MS + 1)) + DELAY_MIN_MS;
  return new Promise(resolve => setTimeout(resolve, delay));
}

// Login to AutoNiq
async function login(page) {
  const username = process.env.AUTONIQ_USERNAME;
  const password = process.env.AUTONIQ_PASSWORD;

  if (!username || !password) {
    throw new Error('AUTONIQ_USERNAME and AUTONIQ_PASSWORD environment variables required');
  }

  console.log('Logging in to AutoNiq...');
  await page.goto(AUTONIQ_LOGIN_URL, { waitUntil: 'networkidle' });

  // Fill login form - adjust selectors based on actual AutoNiq login page
  await page.fill('input[name="email"], input[type="email"], #email', username);
  await page.fill('input[name="password"], input[type="password"], #password', password);

  // Click login button
  await page.click('button[type="submit"], input[type="submit"], .login-button, #login-btn');

  // Wait for navigation to complete
  await page.waitForURL('**/app/**', { timeout: 30000 });

  console.log('Login successful!');
  await randomDelay();
}

// Navigate to VIN in AutoNiq and extract data
async function scrapeVIN(page, vin) {
  const url = `https://autoniq.com/app/evaluator/vin/${vin}`;

  await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
  await randomDelay();

  // Get page content for parsing
  const content = await page.content();

  // Extract grade and announcements
  // Pattern: "Grade: 1.8 AS IS; INOP" or similar
  const gradePattern = /Grade:\s*([\d.]+)\s+([^<]+)/i;
  const match = content.match(gradePattern);

  if (!match) {
    // Try alternative patterns
    const altPattern = /CR\s*(?:Score|Grade):\s*([\d.]+)/i;
    const altMatch = content.match(altPattern);

    if (altMatch) {
      return {
        grade: parseFloat(altMatch[1]),
        announcements: []
      };
    }

    return {
      grade: null,
      announcements: []
    };
  }

  const grade = parseFloat(match[1]);
  const announcementText = match[2].trim();

  // Split by semicolon or common delimiters
  const announcements = announcementText
    .split(/[;|]/)
    .map(a => a.trim())
    .filter(a => a && a.length > 1);

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
  console.log(`Loaded ${vehicles.length} vehicles from runlist\n`);

  // Launch browser
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  });

  const page = await context.newPage();

  try {
    // Login first
    await login(page);

    // Process each VIN
    let processed = 0;
    let errors = 0;

    for (const vehicle of vehicles) {
      const vin = vehicle.Vin || vehicle.VIN || vehicle.vin;
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

        // Scrape VIN
        const data = await scrapeVIN(page, vin);

        // Store in database
        const rawAnnouncements = data.announcements.join('|');
        await storeVehicle(vin, auctionName, data.grade, rawAnnouncements);

        processed++;
        console.log(`✓ ${vin} - Grade: ${data.grade || 'N/A'}, ${data.announcements.length} announcements found`);

      } catch (error) {
        errors++;
        console.error(`✗ ${vin} - Error: ${error.message}`);

        // If we get logged out, try to re-login
        if (error.message.includes('login') || error.message.includes('unauthorized')) {
          console.log('Session expired, re-logging in...');
          await login(page);
        }
      }

      // Rate limiting
      await randomDelay();
    }

    console.log(`\n=== Scraping Complete ===`);
    console.log(`Processed: ${processed}`);
    console.log(`Errors: ${errors}`);
    console.log(`Total: ${vehicles.length}`);

  } finally {
    await browser.close();
    await pool.end();
  }
}

// CLI
const args = process.argv.slice(2);
if (args.length < 2) {
  console.log('Usage: node autoniq-scraper.js <runlist.csv> <auction-name>');
  console.log('Example: node autoniq-scraper.js matched.csv "Manheim Little Rock"');
  console.log('\nRequired env vars: AUTONIQ_USERNAME, AUTONIQ_PASSWORD, DATABASE_URL');
  process.exit(1);
}

const [csvPath, auctionName] = args;
scrapeRunlist(csvPath, auctionName)
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
