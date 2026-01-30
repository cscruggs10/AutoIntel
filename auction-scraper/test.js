#!/usr/bin/env node
import { loadRunlist, scrapeVehicles } from './scraper.js';

const vehicles = loadRunlist('./test-runlist.csv');
console.log(`Loaded ${vehicles.length} vehicles from runlist`);

// Extract VINs
const vins = vehicles.map(v => v.Vin).filter(Boolean);
console.log(`\nVINs to process:`);
vins.forEach((vin, i) => console.log(`${i+1}. ${vin}`));

// Check which need scraping
const auctionName = 'Test Auction'; // TODO: get this from user
const toScrape = await scrapeVehicles(vehicles.map(v => ({ VIN: v.Vin })), auctionName);

console.log(`\n✓ ${toScrape.length} VINs need scraping`);
process.exit(0);
