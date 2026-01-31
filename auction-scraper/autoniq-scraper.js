#!/usr/bin/env node
/**
 * AutoNiq Announcement Scraper
 *
 * Uses Playwright to extract announcement data from AutoNiq
 * for VINs in a runlist CSV.
 */

import { loadRunlist, storeVehicle, pool } from './scraper.js';
import { chromium } from 'playwright';

const AUTONIQ_LOGIN_URL = 'https://autoniq.com/app/login?redirect=/app/';
const AUTONIQ_BASE = 'https://autoniq.com/app/';
const DELAY_MIN_MS = 2000;
const DELAY_MAX_MS = 5000;

// Random delay to avoid detection
function randomDelay() {
  const delay = Math.floor(Math.random() * (DELAY_MAX_MS - DELAY_MIN_MS + 1)) + DELAY_MIN_MS;
  return new Promise(resolve => setTimeout(resolve, delay));
}

// Login to AutoNiq via Okta SSO (two-step flow)
async function login(page) {
  const username = process.env.AUTONIQ_USERNAME;
  const password = process.env.AUTONIQ_PASSWORD;

  if (!username || !password) {
    throw new Error('AUTONIQ_USERNAME and AUTONIQ_PASSWORD environment variables required');
  }

  // Step 1: Navigate to AutoNiq login page
  console.log('  -> Step 1: Navigating to AutoNiq login page...');
  await page.goto(AUTONIQ_LOGIN_URL, { waitUntil: 'networkidle', timeout: 30000 });
  console.log('  -> Current URL:', page.url());

  // Step 2: Handle cookie consent if present
  console.log('  -> Step 2: Checking for cookie consent...');
  const acceptButton = page.locator('button:has-text("Accept")');
  if (await acceptButton.isVisible({ timeout: 3000 }).catch(() => false)) {
    await acceptButton.click();
    console.log('  -> Accepted cookies');
  }

  // Step 3: Click "Sign In" button
  console.log('  -> Step 3: Clicking Sign In button...');
  await page.getByRole('button', { name: 'Sign In' }).click();

  // Step 4: Wait for Okta username page and enter username
  console.log('  -> Step 4: Waiting for Okta Welcome page...');
  await page.waitForSelector('h2:has-text("Welcome!")', { timeout: 15000 });
  console.log('  -> On Okta page, entering username...');
  await page.getByRole('textbox', { name: 'Username' }).fill(username);

  // Step 5: Click "Next" button
  console.log('  -> Step 5: Clicking Next button...');
  await page.getByRole('button', { name: 'Next' }).click();

  // Step 6: Wait for password page and enter password
  console.log('  -> Step 6: Waiting for password page...');
  await page.waitForSelector('h3:has-text("Please sign in to continue.")', { timeout: 15000 });
  console.log('  -> Entering password...');
  await page.getByRole('textbox', { name: 'Password' }).fill(password);

  // Step 7: Click "Sign in" button
  console.log('  -> Step 7: Clicking Sign in button...');
  await page.getByRole('button', { name: 'Sign in' }).click();

  // Step 8: Wait for dashboard
  console.log('  -> Step 8: Waiting for dashboard...');
  await page.waitForSelector('h1:has-text("Recently Evaluated")', { timeout: 30000 });

  console.log('  -> Login successful! Current URL:', page.url());
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
  console.log('[1/5] Loading runlist...');
  const vehicles = loadRunlist(csvPath);
  console.log(`[1/5] Loaded ${vehicles.length} vehicles from runlist\n`);

  // Launch browser
  console.log('[2/5] Launching browser...');
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu', '--disable-dev-shm-usage']
  });
  console.log('[2/5] Browser launched successfully\n');

  console.log('[3/5] Creating browser context...');
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  });
  const page = await context.newPage();
  console.log('[3/5] Browser context created\n');

  try {
    // Login first
    console.log('[4/5] Starting login process...');
    await login(page);
    console.log('[4/5] Login complete\n');

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
