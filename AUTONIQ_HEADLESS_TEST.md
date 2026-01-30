# Autoniq Headless Browser Test

## Purpose
Tests if we can automate Autoniq login + VIN search using a headless browser without triggering bot detection.

## Setup

1. **Add your Autoniq credentials to `.env`:**
   ```bash
   cp .env.example .env
   nano .env  # or use any editor
   ```
   
   Fill in:
   ```
   AUTONIQ_USERNAME=your_email@example.com
   AUTONIQ_PASSWORD=your_password
   ```

2. **Dependencies are installed** ✅
   - puppeteer
   - dotenv

## Run the Test

```bash
./autoniq-headless-test.js
```

Or with a custom VIN:
```bash
./autoniq-headless-test.js 1HGBH41JXMN109186
```

## What It Does

1. ✅ Launches headless Chrome (invisible)
2. ✅ Navigates to Autoniq
3. ✅ Attempts login with your credentials
4. ✅ Takes screenshots at each step
5. ✅ Searches a test VIN
6. ✅ Reports success/failure

## Output

**Screenshots saved:**
- `autoniq-01-homepage.png` - Initial page
- `autoniq-02-login-filled.png` - Login form
- `autoniq-03-after-login.png` - After login attempt
- `autoniq-04-search-results.png` - Search results (if successful)

**Console output:**
- Step-by-step progress
- Success/failure indicators
- Any errors or bot detection warnings

## Success Criteria

✅ **Phase 1 passes if:**
- Login succeeds without CAPTCHA
- VIN search executes
- No "bot detected" messages
- Screenshots show expected pages

❌ **Phase 1 fails if:**
- CAPTCHA appears
- "Suspicious activity" warnings
- Login repeatedly fails
- Site behaves differently than normal browser

## Next Steps

**If successful →** Proceed with full headless automation
**If failed →** Fall back to browser relay + persistent Chrome session
