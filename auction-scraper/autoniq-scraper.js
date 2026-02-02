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
const DELAY_MIN_MS = 500;
const DELAY_MAX_MS = 1500;

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

// Check if we're logged out (redirected to login page)
async function isLoggedOut(page) {
  const currentUrl = page.url();
  if (currentUrl.includes('/login') || currentUrl.includes('/signin')) {
    return true;
  }
  // Check for login button on page (indicates logged out)
  const loginButton = await page.locator('button:has-text("Sign In")').count();
  return loginButton > 0;
}

// Navigate to VIN in AutoNiq and extract data
async function scrapeVIN(page, vin) {
  const url = `https://autoniq.com/app/evaluator/vin/${vin}`;

  await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
  await randomDelay();

  // Check if we got logged out
  if (await isLoggedOut(page)) {
    throw new Error('SESSION_EXPIRED');
  }

  let grade = null;
  let announcements = [];

  try {
    // Wait for page to fully load
    await page.waitForTimeout(1000);

    // Strategy 1: Target the light blue auction info box directly
    // This box contains: "Lane:Run, Grade: X.X | Announcements"
    // Look for elements with the auction info pattern

    // Try multiple selectors for the auction info box
    const selectors = [
      // Light blue box selectors (common patterns)
      '[class*="auction-info"]',
      '[class*="vehicle-info"]',
      '[class*="listing-info"]',
      '[class*="sale-info"]',
      // Try finding by background color or styling
      'div[style*="background"]',
      // Generic containers that might have the data
      '.card-body',
      '.info-box',
      '.details-box'
    ];

    let infoText = null;

    // First, try to find elements containing "Grade:" text
    const gradeElements = await page.locator('*:has-text("Grade:")').all();

    for (const el of gradeElements) {
      try {
        const text = await el.textContent({ timeout: 1000 });
        // Look for the pattern: "Lane:Run, Grade: X.X | Announcement"
        if (text && text.includes('Grade:') && text.includes('|')) {
          // Extract just the relevant line
          const lines = text.split('\n');
          for (const line of lines) {
            if (line.includes('Grade:') && line.includes('|')) {
              infoText = line.trim();
              break;
            }
          }
          if (infoText) break;
        }
      } catch (e) {
        // Element not accessible, continue
      }
    }

    // Strategy 2: If no element found, search the full page text
    if (!infoText) {
      const pageText = await page.textContent('body');

      // Look for lines containing both "Grade:" and "|"
      const lines = pageText.split('\n');
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.includes('Grade:') && trimmed.includes('|')) {
          infoText = trimmed;
          break;
        }
      }
    }

    // Parse the extracted text
    if (infoText) {
      // Pattern: "41:1065, Grade: 2.8 | As Is/BOS ONLY"
      // The grade and announcement are in this format
      const gradeMatch = infoText.match(/Grade:\s*([\d.]+)/i);
      if (gradeMatch) {
        grade = parseFloat(gradeMatch[1]);
      }

      // Get announcements - everything after the pipe until we hit garbage
      const pipeIndex = infoText.indexOf('|');
      if (pipeIndex !== -1) {
        let announcementText = infoText.substring(pipeIndex + 1).trim();

        // Clean up: truncate at common end markers
        // These indicate end of announcement section:
        // - "0/1024" (notes counter)
        // - "More" (More button)
        // - Numbers followed by "Similar"
        // - Mileage patterns (like "146,895" or just trailing numbers)
        announcementText = announcementText
          .replace(/\d+\/\d+.*$/s, '')  // Stop at "0/1024" notes counter
          .replace(/More\d*\s*Similar.*$/si, '')  // Stop at "More Similar Vehicles"
          .replace(/\d+\s*Similar.*$/si, '')  // Stop at "X Similar Vehicles"
          .replace(/\d{1,3}(,\d{3})+.*$/s, '')  // Stop at mileage like "146,895"
          .replace(/\d{2,},?$/s, '')  // Stop at trailing 2+ digit numbers (mileage start)
          .replace(/View\s*CR.*$/si, '')  // Stop at "View CR"
          .replace(/Add\s*Notes.*$/si, '')  // Stop at "Add Notes"
          .trim();

        if (announcementText && announcementText.length > 0) {
          // Split by semicolon or pipe if there are multiple announcements
          announcements = announcementText
            .split(/[;|]/)
            .map(a => a.trim())
            .filter(a => a && a.length > 1 && !a.match(/^\d+$/));  // Filter out pure numbers
        }
      }

      console.log(`  -> Grade: ${grade} | Announcements: ${announcements.join('; ') || 'none'}`);
    } else {
      // Strategy 3: Last resort - search for the specific pattern in page
      const pageText = await page.textContent('body');

      // Look for "Grade: X.X | Announcement" stopping at end markers
      const fullMatch = pageText.match(/Grade:\s*([\d.]+)\s*\|\s*([^0-9][^|]*?)(?=\d+\/\d+|More|Similar|\d{2,3},\d{3}|$)/i);
      if (fullMatch) {
        grade = parseFloat(fullMatch[1]);
        const announcementText = fullMatch[2].trim();
        if (announcementText && announcementText.length > 1) {
          announcements = announcementText.split(/[;|]/).map(a => a.trim()).filter(a => a.length > 1);
        }
        console.log(`  -> Found via fallback: Grade ${grade} | ${announcements.join('; ')}`);
      } else {
        // Even simpler fallback - just get the grade
        const gradeMatch = pageText.match(/Grade:\s*([\d.]+)/i);
        if (gradeMatch) {
          grade = parseFloat(gradeMatch[1]);
          console.log(`  -> Found grade only: ${grade}`);
        }
      }
    }

    // Debug: if nothing found, log what we see
    if (!grade && !announcements.length) {
      console.log(`  -> Warning: No grade/announcements found for ${vin}`);
      // Take a screenshot for debugging (optional)
      // await page.screenshot({ path: `/tmp/debug-${vin}.png` });
    }

  } catch (err) {
    console.log(`  Warning: Could not extract data for ${vin}: ${err.message}`);
  }

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
        const announcementPreview = data.announcements.length > 0
          ? data.announcements.join('; ').substring(0, 50)
          : 'none';
        console.log(`✓ ${vin} - Grade: ${data.grade || 'N/A'} | ${announcementPreview}`);

      } catch (error) {
        // If session expired, re-login and retry this VIN
        if (error.message === 'SESSION_EXPIRED' || error.message.includes('login') || error.message.includes('unauthorized')) {
          console.log(`⚠ Session expired, re-logging in...`);
          try {
            await login(page);
            console.log(`⚠ Re-login successful, retrying ${vin}...`);

            // Retry this VIN after re-login
            const retryData = await scrapeVIN(page, vin);
            const retryAnnouncements = retryData.announcements.join('|');
            await storeVehicle(vin, auctionName, retryData.grade, retryAnnouncements);

            processed++;
            const announcementPreview = retryData.announcements.length > 0
              ? retryData.announcements.join('; ').substring(0, 50)
              : 'none';
            console.log(`✓ ${vin} - Grade: ${retryData.grade || 'N/A'} | ${announcementPreview}`);
            continue; // Skip to next VIN
          } catch (retryError) {
            console.error(`✗ ${vin} - Retry failed: ${retryError.message}`);
            errors++;
          }
        } else {
          errors++;
          console.error(`✗ ${vin} - Error: ${error.message}`);
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
