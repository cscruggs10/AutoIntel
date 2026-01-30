#!/usr/bin/env node
/**
 * Test VIN lookup flow in AutoNiq
 * Run this to figure out how to navigate to a specific VIN
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import readline from 'readline';

const execAsync = promisify(exec);

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function question(prompt) {
  return new Promise(resolve => rl.question(prompt, resolve));
}

async function browserSnapshot(targetId) {
  const { stdout } = await execAsync(`clawdbot browser snapshot --profile=chrome --targetId="${targetId}"`);
  return JSON.parse(stdout);
}

async function browserClick(targetId, ref) {
  const { stdout } = await execAsync(`clawdbot browser act --profile=chrome --targetId="${targetId}" --request='{"kind":"click","ref":"${ref}"}'`);
  return JSON.parse(stdout);
}

async function browserType(targetId, ref, text) {
  const { stdout } = await execAsync(`clawdbot browser act --profile=chrome --targetId="${targetId}" --request='{"kind":"type","ref":"${ref}","text":"${text}"}'`);
  return JSON.parse(stdout);
}

async function main() {
  console.log('\n=== AutoNiq VIN Lookup Flow Test ===\n');
  
  // Get browser tabs
  const { stdout: tabsOutput } = await execAsync('clawdbot browser tabs --profile=chrome');
  const tabs = JSON.parse(tabsOutput);
  
  if (!tabs.tabs || tabs.tabs.length === 0) {
    console.error('No browser tab attached. Please attach Chrome tab first.');
    process.exit(1);
  }
  
  const targetId = tabs.tabs[0].targetId;
  console.log(`Using tab: ${tabs.tabs[0].title}\n`);
  
  // Test VIN
  const testVIN = '1GKKNKLA6KZ107518';
  console.log(`Test VIN: ${testVIN}\n`);
  
  console.log('Taking snapshot...');
  const snapshot = await browserSnapshot(targetId);
  
  // Look for VIN search input
  console.log('\nSearching for VIN input field in snapshot...');
  const snapshotText = JSON.stringify(snapshot, null, 2);
  
  // Check if there's a search/VIN input visible
  const hasSearch = snapshotText.includes('search') || snapshotText.includes('VIN');
  
  if (hasSearch) {
    console.log('✓ Found potential VIN search field');
    console.log('\nSnapshot excerpt:');
    const lines = snapshotText.split('\n');
    const searchLines = lines.filter(l => 
      l.toLowerCase().includes('search') || 
      l.toLowerCase().includes('vin') ||
      l.includes('textbox')
    );
    console.log(searchLines.slice(0, 10).join('\n'));
  } else {
    console.log('✗ No obvious VIN search field found');
    console.log('\nOptions:');
    console.log('1. VIN Scanner button');
    console.log('2. Price Evaluator → Search');
    console.log('3. Direct URL navigation');
  }
  
  console.log('\n--- Manual Navigation Test ---');
  console.log('Instructions: We need to figure out how to search for a VIN.');
  console.log('Try these steps manually in the browser:');
  console.log(`1. Search for VIN: ${testVIN}`);
  console.log('2. Note which buttons/fields you clicked');
  console.log('3. Take a snapshot after each step\n');
  
  await question('Press Enter when you\'ve navigated to the VIN...');
  
  console.log('\nTaking snapshot of VIN page...');
  const vinSnapshot = await browserSnapshot(targetId);
  
  // Look for announcement data
  const vinSnapshotText = JSON.stringify(vinSnapshot, null, 2);
  
  const gradeMatch = vinSnapshotText.match(/Grade:\s*([\d.]+)\s*(.+?)(?:"|\\n)/);
  
  if (gradeMatch) {
    console.log('\n✓ Found announcement data!');
    console.log(`Grade: ${gradeMatch[1]}`);
    console.log(`Announcements: ${gradeMatch[2]}`);
  } else {
    console.log('\n✗ No announcement data found');
    console.log('Snapshot excerpt:');
    console.log(vinSnapshotText.substring(0, 500));
  }
  
  rl.close();
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
