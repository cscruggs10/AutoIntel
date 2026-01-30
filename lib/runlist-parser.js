const { parse } = require('csv-parse/sync');
const fs = require('fs');

/**
 * Parse a runlist CSV file using provided column mappings
 * @param {string} filePath - Path to CSV file
 * @param {Object} columnMappings - Column name mappings (e.g., { vin: 'VIN', year: 'Year', ... })
 * @returns {Array} Parsed vehicle records
 */
function parseRunlistWithMappings(filePath, columnMappings) {
  const csvContent = fs.readFileSync(filePath, 'utf-8');

  // Parse CSV with headers
  const records = parse(csvContent, {
    columns: true,
    skip_empty_lines: true,
    relax_quotes: true,
    trim: true
  });

  if (records.length === 0) {
    return [];
  }

  // Transform records using column mapping
  const vehicles = records.map(record => {
    const vehicle = {
      vin: record[columnMappings.vin]?.trim(),
      year: parseInt(record[columnMappings.year]) || null,
      make: record[columnMappings.make]?.trim(),
      model: record[columnMappings.model]?.trim(),
      mileage: parseMileage(record[columnMappings.mileage]),
      lane: columnMappings.lane ? record[columnMappings.lane]?.trim() : null,
      exterior_color: columnMappings.exterior_color ? record[columnMappings.exterior_color]?.trim() : null,
      grade: columnMappings.grade ? parseFloat(record[columnMappings.grade]) || null : null
    };

    // Optional fields
    if (columnMappings.lot) {
      vehicle.lot = record[columnMappings.lot]?.trim();
    }
    if (columnMappings.run_number) {
      vehicle.run_number = record[columnMappings.run_number]?.trim();
    }
    if (columnMappings.stock_number) {
      vehicle.stock_number = record[columnMappings.stock_number]?.trim();
    }
    if (columnMappings.has_condition_report) {
      vehicle.has_condition_report = record[columnMappings.has_condition_report] === 'TRUE';
    }
    if (columnMappings.mmr_value) {
      vehicle.mmr_value = parseFloat(record[columnMappings.mmr_value]) || null;
    }
    if (columnMappings.interior_color) {
      vehicle.interior_color = record[columnMappings.interior_color]?.trim();
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
 * Get CSV headers from a file
 */
function getCSVHeaders(filePath) {
  const csvContent = fs.readFileSync(filePath, 'utf-8');
  const records = parse(csvContent, {
    columns: true,
    skip_empty_lines: true,
    relax_quotes: true,
    trim: true,
    to: 1
  });

  if (records.length === 0) {
    return [];
  }

  return Object.keys(records[0]);
}

// Required fields for mapping
const REQUIRED_FIELDS = ['vin', 'year', 'make', 'model'];

// Optional fields for mapping
const OPTIONAL_FIELDS = [
  'mileage',
  'lane',
  'lot',
  'run_number',
  'stock_number',
  'exterior_color',
  'interior_color',
  'grade',
  'mmr_value',
  'has_condition_report'
];

module.exports = {
  parseRunlistWithMappings,
  getCSVHeaders,
  parseMileage,
  REQUIRED_FIELDS,
  OPTIONAL_FIELDS
};
