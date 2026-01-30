const { parse } = require('csv-parse/sync');
const fs = require('fs');

// Known auction formats
const AUCTION_FORMATS = {
  'Americas Auto Auction - Atlanta Cartersville, GA': {
    vin: 'Vin',
    year: 'Year',
    make: 'Make',
    model: 'Model',
    style: 'Style',
    mileage: 'Mileage',
    lane: 'Lane',
    lot: 'Lot',
    run_number: 'Run Number',
    stock_number: 'Stock Number',
    exterior_color: 'Exterior Color',
    has_condition_report: 'Has Condition Report',
    grade: 'Grade'
  }
};

/**
 * Parse a runlist CSV file
 * @param {string} filePath - Path to CSV file
 * @param {string} auctionName - Name of auction house
 * @returns {Array} Parsed vehicle records
 */
function parseRunlist(filePath, auctionName) {
  const csvContent = fs.readFileSync(filePath, 'utf-8');
  
  // Parse CSV with headers
  const records = parse(csvContent, {
    columns: true,
    skip_empty_lines: true,
    relax_quotes: true,
    trim: true
  });
  
  // Get format mapping for this auction
  const format = AUCTION_FORMATS[auctionName];
  
  if (!format) {
    throw new Error(`Unknown auction format: ${auctionName}. Please configure column mappings.`);
  }
  
  // Transform records using column mapping
  const vehicles = records.map(record => {
    return {
      vin: record[format.vin]?.trim(),
      year: parseInt(record[format.year]) || null,
      make: record[format.make]?.trim(),
      model: record[format.model]?.trim(),
      style: record[format.style]?.trim(),
      mileage: parseInt(record[format.mileage]) || null,
      lane: record[format.lane]?.trim(),
      lot: record[format.lot]?.trim(),
      run_number: record[format.run_number]?.trim(),
      stock_number: record[format.stock_number]?.trim(),
      exterior_color: record[format.exterior_color]?.trim(),
      has_condition_report: record[format.has_condition_report] === 'TRUE',
      grade: parseFloat(record[format.grade]) || null
    };
  }).filter(v => v.vin && v.vin.length >= 10); // Must have valid VIN
  
  return vehicles;
}

/**
 * Get list of supported auction formats
 */
function getSupportedAuctions() {
  return Object.keys(AUCTION_FORMATS);
}

/**
 * Add a new auction format mapping
 */
function addAuctionFormat(auctionName, columnMappings) {
  AUCTION_FORMATS[auctionName] = columnMappings;
}

module.exports = {
  parseRunlist,
  getSupportedAuctions,
  addAuctionFormat,
  AUCTION_FORMATS
};
