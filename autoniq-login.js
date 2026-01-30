#!/usr/bin/env node
/**
 * AUTONIQ Headless Browser Login
 * Automates the two-step Okta authentication flow
 */

const fs = require('fs');
const path = require('path');

// Load credentials
const configPath = path.join(__dirname, 'autoniq-config.json');
const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));

async function loginToAutoniq(page) {
  console.log('🔐 Starting AUTONIQ login...');
  
  // Step 1: Navigate to login page
  console.log('📍 Navigating to login page...');
  await page.goto(config.loginUrl, { waitUntil: 'networkidle' });
  
  // Step 2: Handle cookie consent if present
  console.log('🍪 Checking for cookie dialog...');
  const acceptButton = page.locator('button:has-text("Accept")');
  if (await acceptButton.isVisible({ timeout: 3000 }).catch(() => false)) {
    await acceptButton.click();
    console.log('✅ Cookies accepted');
  }
  
  // Step 3: Click "Sign In" button to get to login form
  console.log('🔘 Clicking Sign In...');
  await page.getByRole('button', { name: 'Sign In' }).click();
  
  // Step 4: Wait for and enter username
  console.log('👤 Entering username...');
  await page.waitForSelector('h2:has-text("Welcome!")', { timeout: 10000 });
  // Find the visible username input (not the cookie search)
  await page.getByRole('textbox', { name: 'Username' }).fill(config.username);
  
  // Optional: Check "Remember me"
  // await page.check('input[type="checkbox"]');
  
  // Step 5: Click "Next"
  console.log('⏭️  Clicking Next...');
  await page.getByRole('button', { name: 'Next' }).click();
  
  // Wait for password form
  await page.waitForSelector('h3:has-text("Please sign in to continue.")', { timeout: 10000 });
  
  // Step 6: Enter password
  console.log('🔑 Entering password...');
  await page.getByRole('textbox', { name: 'Password' }).fill(config.password);
  
  // Step 7: Click "Sign in"
  console.log('✅ Signing in...');
  await page.getByRole('button', { name: 'Sign in' }).click();
  
  // Wait for dashboard to load
  console.log('⏳ Waiting for dashboard...');
  await page.waitForSelector('h1:has-text("Recently Evaluated")', { timeout: 15000 });
  
  console.log('✅ Login successful!');
  console.log('📊 Dashboard loaded at:', page.url());
  
  return true;
}

// Export for use as module
module.exports = { loginToAutoniq };

// CLI execution
if (require.main === module) {
  (async () => {
    const { chromium } = require('playwright');
    
    const browser = await chromium.launch({ 
      headless: true,   // Headless mode for server environments
      slowMo: 100       // Slight delay for stability
    });
    
    const context = await browser.newContext();
    const page = await context.newPage();
    
    try {
      await loginToAutoniq(page);
      
      // Keep browser open for 30 seconds to verify
      console.log('🔍 Keeping browser open for 30 seconds...');
      await page.waitForTimeout(30000);
      
    } catch (error) {
      console.error('❌ Login failed:', error.message);
      console.log('📸 Taking screenshot for debugging...');
      await page.screenshot({ path: 'autoniq-error.png', fullPage: true });
      console.log('Screenshot saved to autoniq-error.png');
      throw error;
    } finally {
      await browser.close();
    }
  })();
}
