#!/bin/bash
# Morning Brief - 8:00 AM CT
cd /root/clawd
echo "Morning brief triggered at $(date)" >> /root/clawd/logs/cron.log
/usr/bin/clawdbot message send --target 6910769194 --message "☀️ Morning Brief

What's your primary task today? The one thing that makes today a win."
