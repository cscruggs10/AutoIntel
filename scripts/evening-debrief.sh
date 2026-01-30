#!/bin/bash
# Evening Debrief - 8:30 PM CT
cd /root/clawd
echo "Evening debrief triggered at $(date)" >> /root/clawd/logs/cron.log
/usr/bin/clawdbot message send --target 6910769194 --message "🌙 Evening Debrief

1. Did you work out today?
2. Did you complete daily planning/task tracking?
3. Did you log food in Lose It?"
