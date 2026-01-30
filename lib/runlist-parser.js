const { parse } = require('csv-parse/sync');
const fs = require('fs');

// Auction format groups (one format for all locations in network)
const AUCTION_FORMAT_GROUPS = {
  'Edge Pipeline': {
    description: 'Edge Pipeline auctions (Americas Auto Auction, etc.)',
    columns: {
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
  },
  'Manheim': {
    description: 'Manheim auctions (all locations)',
    columns: {
      vin: 'Vin',
      year: 'Year',
      make: 'Make',
      model: 'Model',
      trim: 'Trim',
      mileage: 'Odometer Value',
      lane: 'Lane',
      run_number: 'Run',
      exterior_color: 'Exterior Color',
      interior_color: 'Interior Color',
      mmr_value: 'MMR',
      grade: 'Condition Report Grade',
      seller_name: 'Seller Name',
      auction_house: 'Auction House'
    }
  }
};

/**
 * Detect which format group an auction belongs to
 */
function detectFormatGroup(auctionName) {
  const name = auctionName.toLowerCase();
  
  // Check for Manheim
  if (name.includes('manheim')) {
    return 'Manheim';
  }
  
  // Check for Edge Pipeline locations
  const edgePipelineLocations = [
    'americas auto auction',
    'united auto exchange',
    'carolina auto auction',
    'tri-cities auto auction'
  ];
  
  for (const location of edgePipelineLocations) {
    if (name.includes(location)) {
      return 'Edge Pipeline';
    }
  }
  
  return null;
}

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
  
  // Detect format group
  const formatGroup = detectFormatGroup(auctionName);
  
  if (!formatGroup) {
    throw new Error(
      `Unknown auction format: ${auctionName}\n` +
      `Supported groups: ${Object.keys(AUCTION_FORMAT_GROUPS).join(', ')}\n` +
      `If this is a new auction network, please add format mapping.`
    );
  }
  
  const format = AUCTION_FORMAT_GROUPS[formatGroup].columns;
  
  // Transform records using column mapping
  const vehicles = records.map(record => {
    const vehicle = {
      vin: record[format.vin]?.trim(),
      year: parseInt(record[format.year]) || null,
      make: record[format.make]?.trim(),
      model: record[format.model]?.trim(),
      mileage: parseMileage(record[format.mileage]),
      lane: record[format.lane]?.trim(),
      exterior_color: record[format.exterior_color]?.trim(),
      grade: parseFloat(record[format.grade]) || null
    };
    
    // Optional fields (may not exist in all formats)
    if (format.style) vehicle.style = record[format.style]?.trim();
    if (format.trim) vehicle.style = record[format.trim]?.trim(); // Use trim as style
    if (format.lot) vehicle.lot = record[format.lot]?.trim();
    if (format.run_number) vehicle.run_number = record[format.run_number]?.trim();
    if (format.stock_number) vehicle.stock_number = record[format.stock_number]?.trim();
    if (format.has_condition_report) {
      vehicle.has_condition_report = record[format.has_condition_report] === 'TRUE';
    }
    if (format.mmr_value) {
      vehicle.mmr_value = parseFloat(record[format.mmr_value]) || null;
    }
    if (format.interior_color) {
      vehicle.interior_color = record[format.interior_color]?.trim();
    }
    
    return vehicle;
  }).filter(v => v.vin && v.vin.length >= 10); // Must have valid VIN
  
  return vehicles;
}

/**
 * Parse mileage (handle 999990 as invalid)
 */
function parseMileage(value) {
  const mileage = parseInt(value);
  if (!mileage || mileage >= 999990) return null;
  return mileage;
}

/**
 * Get list of supported auction format groups
 */
function getSupportedAuctions() {
  return Object.keys(AUCTION_FORMAT_GROUPS).map(group => ({
    group,
    description: AUCTION_FORMAT_GROUPS[group].description
  }));
}

/**
 * Add a new auction format group
 */
function addAuctionFormatGroup(groupName, description, columnMappings) {
  AUCTION_FORMAT_GROUPS[groupName] = {
    description,
    columns: columnMappings
  };
}

module.exports = {
  parseRunlist,
  getSupportedAuctions,
  addAuctionFormatGroup,
  detectFormatGroup,
  AUCTION_FORMAT_GROUPS
};
