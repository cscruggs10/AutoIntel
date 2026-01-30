# Manual Browser Relay Test

Before we can automate, I need to see the actual login flow.

## Steps:

1. **Attach Browser Relay:**
   - Open Chrome
   - Go to www.autoniq.com
   - Click the Clawdbot Browser Relay extension button (make badge show "ON")

2. **I'll navigate and inspect:**
   - Click "Launch App"
   - See what the login page actually looks like
   - Identify the correct selectors for:
     - Email/username field
     - Password field
     - Login button
     - Post-login page indicators

3. **Then I can:**
   - Update the headless script with correct selectors
   - Or determine if headless will trigger bot detection

## Alternative Quick Test

If you have access already, can you:
1. Open app.autoniq.com in a browser
2. Right-click on the email field → Inspect
3. Send me the HTML for the login form

That would speed this up significantly.
