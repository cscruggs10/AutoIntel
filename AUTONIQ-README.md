# AUTONIQ Headless Browser Automation

Automated login for AUTONIQ using Playwright.

## Setup

1. **Install dependencies:**
   ```bash
   npm install playwright
   ```

2. **Configure credentials:**
   Edit `autoniq-config.json` and add your password:
   ```json
   {
     "username": "corey@ifinancememphis.com",
     "password": "YOUR_ACTUAL_PASSWORD",
     "loginUrl": "https://autoniq.com/app/login?redirect=/app/"
   }
   ```

3. **Make script executable:**
   ```bash
   chmod +x autoniq-login.js
   ```

## Usage

### Standalone Test
```bash
node autoniq-login.js
```

### As Module
```javascript
const { loginToAutoniq } = require('./autoniq-login');

// Use with existing Playwright page
await loginToAutoniq(page);
```

## Login Flow

1. Navigate to login page
2. Enter username → Click "Next"
3. Enter password → Click "Sign in"
4. Wait for dashboard ("Recently Evaluated")

## Notes

- Two-step Okta authentication
- Configurable headless mode
- Waits for network idle to ensure page loads
- Validates successful login by checking for dashboard heading
