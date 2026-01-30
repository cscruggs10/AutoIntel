#!/usr/bin/env node

/**
 * Autoniq Headless Browser Test
 * Tests if we can automate Autoniq login + VIN search without detection
 */

const puppeteer = require('puppeteer');
require('dotenv').config();

const AUTONIQ_URL = 'https://www.autoniq.com';
const TEST_VIN = '1HGBH41JXMN109186'; // Default test VIN, can override

async function testAutoniqHeadless() {
  console.log('🚀 Starting Autoniq headless test...\n');

  // Check for credentials
  const username = process.env.AUTONIQ_USERNAME;
  const password = process.env.AUTONIQ_PASSWORD;

  if (!username || !password) {
    console.error('❌ Missing credentials!');
    console.error('Set AUTONIQ_USERNAME and AUTONIQ_PASSWORD in .env file\n');
    process.exit(1);
  }

  const browser = await puppeteer.launch({
    headless: 'new',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-blink-features=AutomationControlled'
    ]
  });

  try {
    const page = await browser.newPage();

    // Set realistic viewport
    await page.setViewport({ width: 1920, height: 1080 });

    // Set user agent to look like real Chrome
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

    // Remove webdriver flag
    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => false });
    });

    console.log('📍 Navigating to Autoniq...');
    await page.goto(AUTONIQ_URL, { waitUntil: 'networkidle2', timeout: 30000 });

    // Take screenshot of homepage
    await page.screenshot({ path: 'autoniq-01-homepage.png' });
    console.log('✅ Homepage loaded (screenshot: autoniq-01-homepage.png)');

    // Go directly to the app login page
    console.log('🔘 Navigating to login page...');
    await page.goto('https://app.autoniq.com', { waitUntil: 'networkidle2', timeout: 15000 });
    await new Promise(r => setTimeout(r, 2000)); // Let page settle
    await page.screenshot({ path: 'autoniq-02-login-page.png' });
    console.log('✅ App page loaded (screenshot: autoniq-02-login-page.png)');

    console.log('\n🔐 Attempting login...');

    // Wait for login form
    try {
      await page.waitForSelector('input[type="email"], input[type="text"], input[name="username"], input[name="email"]', { timeout: 5000 });
      
      // Try common login field patterns
      const usernameField = await page.$('input[type="email"]') 
        || await page.$('input[name="username"]')
        || await page.$('input[id*="user"]');
      
      const passwordField = await page.$('input[type="password"]');

      if (usernameField && passwordField) {
        await usernameField.type(username, { delay: 100 });
        await passwordField.type(password, { delay: 100 });
        
        await page.screenshot({ path: 'autoniq-02-login-filled.png' });
        console.log('✅ Credentials entered');

        // Find and click login button
        const loginButton = await page.$('button[type="submit"]')
          || await page.$('input[type="submit"]')
          || await page.$('button:has-text("Sign In")')
          || await page.$('button:has-text("Login")');

        if (loginButton) {
          await loginButton.click();
          console.log('🔄 Login submitted...');

          // Wait for navigation or error
          await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 15000 }).catch(() => {});
          
          await page.screenshot({ path: 'autoniq-03-after-login.png' });

          // Check if we're logged in
          const currentUrl = page.url();
          const pageContent = await page.content();

          if (pageContent.includes('Sign Out') || pageContent.includes('Logout') || !currentUrl.includes('login')) {
            console.log('✅ Login successful!\n');
            
            // Test VIN search
            const testVin = process.argv[2] || TEST_VIN;
            console.log(`🔍 Testing VIN search: ${testVin}`);

            // Look for search box - adjust selectors as needed
            const searchInput = await page.$('input[type="search"]')
              || await page.$('input[placeholder*="VIN"]')
              || await page.$('input[name*="search"]');

            if (searchInput) {
              await searchInput.type(testVin, { delay: 100 });
              await page.keyboard.press('Enter');

              await page.waitForTimeout(3000);
              await page.screenshot({ path: 'autoniq-04-search-results.png' });

              const resultsContent = await page.content();
              
              console.log('✅ Search executed');
              console.log('📸 Screenshots saved: autoniq-01-homepage.png → autoniq-04-search-results.png\n');

              // Try to extract some data
              const pageText = await page.evaluate(() => document.body.innerText);
              console.log('📄 Page preview:');
              console.log(pageText.substring(0, 500) + '...\n');

              console.log('✅ PHASE 1 TEST SUCCESSFUL!');
              console.log('Headless automation appears viable. No obvious bot detection.\n');

            } else {
              console.log('⚠️  Could not find search input. Manual inspection needed.');
              console.log('Check autoniq-03-after-login.png for page structure.\n');
            }

          } else {
            console.log('❌ Login may have failed');
            console.log('Check autoniq-03-after-login.png for error messages\n');
          }

        } else {
          console.log('❌ Could not find login button');
          console.log('Check autoniq-02-login-filled.png\n');
        }

      } else {
        console.log('❌ Could not find login form fields');
        console.log('Page structure may be different. Check autoniq-01-homepage.png\n');
      }

    } catch (err) {
      console.log('❌ Error during login flow:', err.message);
      await page.screenshot({ path: 'autoniq-error.png' });
      console.log('Check autoniq-error.png for details\n');
    }

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error(error.stack);
  } finally {
    await browser.close();
    console.log('🏁 Browser closed');
  }
}

// Run test
testAutoniqHeadless().catch(console.error);
