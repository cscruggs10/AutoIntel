# Bullet Journal System

Digital implementation of your Finisher's Journal system with EOS-style quarterly rocks.

## Structure

```
journal/
├── goals/           # Quarterly outcome goals (3-5 per quarter)
│   └── 2026-Q1.md
├── weeks/           # Weekly planning (Sunday sessions)
│   └── 2026-W04.md
├── days/            # Daily execution (primary/secondary/additional tasks)
│   └── 2026-01-27.md
├── habits/          # Habit tracking (start with 3, add 1 per quarter)
│   └── tracker.md
└── reviews/         # Weekly reviews (what worked, what didn't, improvements)
    └── 2026-W04-review.md
```

## Workflow

### Quarterly (Every 13 weeks)
1. Review previous quarter
2. Set 3-5 SMART outcome goals for next 90 days
3. Break each goal into 5 action steps
4. Define key motivation for each goal
5. Add one new habit to tracker

### Weekly (Sunday)
1. Review last week (`reviews/YYYY-Wnn-review.md`)
2. Set weekly priority (aligns with quarterly goal)
3. List 10-14 secondary tasks
4. Migrate incomplete tasks from previous week

### Daily
1. Define primary task (most important)
2. List 2 secondary tasks (only after primary is done)
3. Additional tasks and reminders
4. Track notes/ideas throughout the day
5. Update habit tracker

### Weekly Review (End of week)
1. What worked?
2. What didn't work?
3. How will you improve?
4. Update goal progress
5. Migrate tasks to next week

## Task Status Symbols
- `[ ]` To Do
- `[x]` Completed
- `[/]` In Progress
- `[-]` Canceled
- `[>]` Migrated

## Quick Access
- Current Quarter: `journal/goals/2026-Q1.md`
- Current Week: `journal/weeks/2026-W04.md`
- Today: `journal/days/2026-01-27.md`
- Habits: `journal/habits/tracker.md`
