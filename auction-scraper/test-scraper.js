#!/usr/bin/env node
/**
 * Test scraper with a few VINs before running full batch
 */

import { parseAnnouncements } from './parse-announcements.js';

// Test parsing logic
console.log('=== Testing Announcement Parser ===\n');

const testCases = [
  {
    text: 'Grade: 1.0 AS IS; INOP; TMU',
    expected: { grade: 1.0, announcements: ['AS IS', 'INOP', 'TMU'] }
  },
  {
    text: 'Grade: 1.8 AS IS; INOP',
    expected: { grade: 1.8, announcements: ['AS IS', 'INOP'] }
  },
  {
    text: 'Grade: 2.5 RUNS AND DRIVES',
    expected: { grade: 2.5, announcements: ['RUNS AND DRIVES'] }
  }
];

let passed = 0;
let failed = 0;

for (const test of testCases) {
  const result = parseAnnouncements(test.text);
  
  const gradeMatch = result.grade === test.expected.grade;
  const announcementsMatch = JSON.stringify(result.announcements) === JSON.stringify(test.expected.announcements);
  
  if (gradeMatch && announcementsMatch) {
    console.log(`✓ PASS: "${test.text}"`);
    passed++;
  } else {
    console.log(`✗ FAIL: "${test.text}"`);
    console.log(`  Expected:`, test.expected);
    console.log(`  Got:`, result);
    failed++;
  }
}

console.log(`\n${passed} passed, ${failed} failed\n`);

if (failed > 0) {
  process.exit(1);
}

console.log('✓ Parser tests passed!\n');
console.log('Next steps:');
console.log('1. Run: ./setup-db.sh (if not already done)');
console.log('2. Attach browser relay to Chrome tab');
console.log('3. Run: node autoniq-scraper.js test-runlist.csv "United Auto Exchange Memphis"');
