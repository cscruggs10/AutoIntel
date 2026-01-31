# AutoNiq Login Workflow Guide

**For Claude Code / Playwright Automation**

## Overview

AutoNiq uses a **two-step Okta authentication flow**. This is NOT a simple username/password form — it's split across two separate pages with specific waits and selectors.

---

## Login Flow (Step-by-Step)

### Step 1: Navigate to Login URL
```javascript
const loginUrl = 'https://autoniq.com/app/login?redirect=/app/';
await page.goto(loginUrl, { waitUntil: 'networkidle' });
```

**What happens:**
- Page loads with a "Sign In" button
- May show cookie consent dialog (handle if present)

---

### Step 2: Handle Cookie Consent (Optional)
```javascript
const acceptButton = page.locator('button:has-text("Accept")');
if (await acceptButton.isVisible({ timeout: 3000 }).catch(() => false)) {
  await acceptButton.click();
  console.log('✅ Cookies accepted');
}
```

**Note:** This may or may not appear. Don't fail if it's not there.

---

### Step 3: Click "Sign In" Button
```javascript
await page.getByRole('button', { name: 'Sign In' }).click();
```

**What happens:**
- Redirects to Okta login page (first page of two-step flow)
- Shows "Welcome!" heading
- Shows username field (NOT password yet)

---

### Step 4: Enter Username (First Page)
```javascript
// Wait for the "Welcome!" page to load
await page.waitForSelector('h2:has-text("Welcome!")', { timeout: 10000 });

// Enter username (email)
await page.getByRole('textbox', { name: 'Username' }).fill(username);

// Optional: Check "Remember me"
// await page.check('input[type="checkbox"]');
```

**Important:**
- This is ONLY username — password field doesn't exist yet
- Use `getByRole('textbox', { name: 'Username' })` to avoid selecting the cookie consent search box
- Wait for "Welcome!" heading to ensure page is loaded

---

### Step 5: Click "Next" Button
```javascript
await page.getByRole('button', { name: 'Next' }).click();
```

**What happens:**
- Submits username
- Redirects to password page (second step)
- Shows "Please sign in to continue." heading
- NOW password field appears

---

### Step 6: Enter Password (Second Page)
```javascript
// Wait for password page to load
await page.waitForSelector('h3:has-text("Please sign in to continue.")', { timeout: 10000 });

// Enter password
await page.getByRole('textbox', { name: 'Password' }).fill(password);
```

**Important:**
- This is a SEPARATE page from the username page
- Must wait for the "Please sign in to continue." heading
- Don't try to fill password until this page loads

---

### Step 7: Click "Sign in" Button
```javascript
await page.getByRole('button', { name: 'Sign in' }).click();
```

**What happens:**
- Submits password
- Authenticates
- Redirects to dashboard

---

### Step 8: Wait for Dashboard
```javascript
// Wait for dashboard to fully load
await page.waitForSelector('h1:has-text("Recently Evaluated")', { timeout: 15000 });

console.log('✅ Login successful!');
console.log('📊 Dashboard URL:', page.url());
```

**Success indicators:**
- URL is `https://autoniq.com/app/`
- Dashboard shows "Recently Evaluated" heading
- Search bar is available

---

## Complete Working Code

```javascript
async function loginToAutoniq(page, username, password) {
  console.log('🔐 Starting AUTONIQ login...');
  
  // Step 1: Navigate to login page
  await page.goto('https://autoniq.com/app/login?redirect=/app/', { 
    waitUntil: 'networkidle' 
  });
  
  // Step 2: Handle cookie consent if present
  const acceptButton = page.locator('button:has-text("Accept")');
  if (await acceptButton.isVisible({ timeout: 3000 }).catch(() => false)) {
    await acceptButton.click();
  }
  
  // Step 3: Click "Sign In" button
  await page.getByRole('button', { name: 'Sign In' }).click();
  
  // Step 4: Wait for and enter username (FIRST PAGE)
  await page.waitForSelector('h2:has-text("Welcome!")', { timeout: 10000 });
  await page.getByRole('textbox', { name: 'Username' }).fill(username);
  
  // Step 5: Click "Next"
  await page.getByRole('button', { name: 'Next' }).click();
  
  // Step 6: Wait for and enter password (SECOND PAGE)
  await page.waitForSelector('h3:has-text("Please sign in to continue.")', { timeout: 10000 });
  await page.getByRole('textbox', { name: 'Password' }).fill(password);
  
  // Step 7: Click "Sign in"
  await page.getByRole('button', { name: 'Sign in' }).click();
  
  // Step 8: Wait for dashboard
  await page.waitForSelector('h1:has-text("Recently Evaluated")', { timeout: 15000 });
  
  console.log('✅ Login successful!');
  return true;
}
```

---

## Common Mistakes to Avoid

❌ **Don't try to fill password on first page** — it doesn't exist yet  
❌ **Don't skip the "Next" button** — username and password are separate pages  
❌ **Don't use generic selectors** like `input[type="text"]` — there are multiple inputs  
❌ **Don't forget to wait** — Okta pages take time to load between steps  

✅ **Do use role-based selectors** — `getByRole('textbox', { name: 'Username' })`  
✅ **Do wait for headings** — They indicate page load state  
✅ **Do add timeouts** — Network can be slow  
✅ **Do handle optional elements** — Cookie dialog may not appear  

---

## Testing

Run the standalone login script:
```bash
cd /root/clawd
node autoniq-login.js
```

This will:
1. Launch headless browser
2. Execute full login flow
3. Wait 30 seconds on dashboard (so you can verify)
4. Take screenshots if errors occur
5. Report success/failure

---

## Credentials Config

Create `autoniq-config.json`:
```json
{
  "username": "your_email@example.com",
  "password": "your_password",
  "loginUrl": "https://autoniq.com/app/login?redirect=/app/"
}
```

Or use environment variables:
```bash
AUTONIQ_USERNAME=your_email@example.com
AUTONIQ_PASSWORD=your_password
```

---

## Key Takeaways

1. **Two-step flow:** Username → Next → Password → Sign in
2. **Different pages:** Username and password are on separate Okta pages
3. **Wait between steps:** Each click triggers a page load
4. **Role-based selectors:** Most reliable approach
5. **Test standalone first:** Get login working before integrating with scraper

---

## Next Steps After Login

Once logged in, you can:
- Navigate to VIN search: `https://autoniq.com/app/evaluator/vin/{VIN}`
- Extract announcement data from page
- Search multiple VINs sequentially

The login session persists for the browser context, so you only need to log in once per scraping session.
