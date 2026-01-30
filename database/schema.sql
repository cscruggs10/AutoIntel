-- Historical Sales Data
CREATE TABLE IF NOT EXISTS historical_sales (
  id SERIAL PRIMARY KEY,
  -- Core identifiers
  date_sold DATE,
  posting_date DATE,
  stock_nbr VARCHAR(50),
  vin VARCHAR(17) NOT NULL,
  stock_date DATE,
  
  -- Vehicle info
  year INTEGER,
  make VARCHAR(50),
  model VARCHAR(50),
  book_value DECIMAL(10,2),
  
  -- Purchase/cost info
  purchase_price DECIMAL(10,2),
  total_repairs DECIMAL(10,2),
  finder_fee DECIMAL(10,2),
  after_sale_repairs DECIMAL(10,2),
  total_cost DECIMAL(10,2),
  
  -- Sales info
  sales_price DECIMAL(10,2),
  doc_fee DECIMAL(10,2),
  sales_commission DECIMAL(10,2),
  sales_tax_amt DECIMAL(10,2),
  sales_type VARCHAR(50),
  
  -- Profitability
  gross_profit DECIMAL(10,2),
  net_profit DECIMAL(10,2),
  
  -- Financing
  original_balance DECIMAL(10,2),
  balance_remaining DECIMAL(10,2),
  amount_financed DECIMAL(10,2),
  apr DECIMAL(5,2),
  credit_score INTEGER,
  
  -- Trade info
  total_trade_acv DECIMAL(10,2),
  trade_amount DECIMAL(10,2),
  
  -- Operational
  days_to_sell INTEGER,
  location VARCHAR(100),
  branch_nbr VARCHAR(50),
  purchased_from VARCHAR(100),
  primary_name VARCHAR(100),
  finder_name VARCHAR(100),
  salesman_code VARCHAR(50),
  class VARCHAR(50),
  
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Runlists (uploaded CSV files)
CREATE TABLE IF NOT EXISTS runlists (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  auction_name VARCHAR(255),
  auction_date DATE,
  uploaded_by VARCHAR(100),
  uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  total_vehicles INTEGER DEFAULT 0,
  matched_vehicles INTEGER DEFAULT 0,
  scraped_vehicles INTEGER DEFAULT 0,
  status VARCHAR(50) DEFAULT 'uploaded' -- uploaded, matched, scraping, completed
);

-- Runlist Vehicles (individual VINs from runlists)
CREATE TABLE IF NOT EXISTS runlist_vehicles (
  id SERIAL PRIMARY KEY,
  runlist_id INTEGER REFERENCES runlists(id) ON DELETE CASCADE,
  vin VARCHAR(17) NOT NULL,
  year INTEGER,
  make VARCHAR(50),
  model VARCHAR(50),
  style VARCHAR(100),
  exterior_color VARCHAR(50),
  mileage INTEGER,
  lane VARCHAR(50),
  lot VARCHAR(50),
  run_number VARCHAR(50),
  stock_number VARCHAR(50),
  has_condition_report BOOLEAN DEFAULT FALSE,
  grade DECIMAL(3,1),
  
  -- Matching results
  matched BOOLEAN DEFAULT FALSE,
  match_count INTEGER DEFAULT 0,
  last_sold_date DATE,
  
  -- AUTONIQ scraping
  needs_scraping BOOLEAN DEFAULT TRUE,
  scraped BOOLEAN DEFAULT FALSE,
  
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Auction Format Mappings (store column mappings per auction house)
CREATE TABLE IF NOT EXISTS auction_formats (
  id SERIAL PRIMARY KEY,
  auction_name VARCHAR(255) NOT NULL UNIQUE,
  column_mappings JSONB NOT NULL, -- Store column name mappings
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- AUTONIQ Scraped Data
CREATE TABLE IF NOT EXISTS autoniq_data (
  id SERIAL PRIMARY KEY,
  runlist_vehicle_id INTEGER REFERENCES runlist_vehicles(id) ON DELETE CASCADE,
  vin VARCHAR(17) NOT NULL,
  auction_name VARCHAR(255),
  auction_date TIMESTAMP,
  lane VARCHAR(50),
  lot VARCHAR(50),
  grade VARCHAR(10),
  announcements TEXT[], -- Array of announcements
  price_estimate DECIMAL(10,2),
  condition_report TEXT,
  scraped_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_historical_sales_vin ON historical_sales(vin);
CREATE INDEX IF NOT EXISTS idx_historical_sales_ymm ON historical_sales(year, make, model);
CREATE INDEX IF NOT EXISTS idx_runlist_vehicles_vin ON runlist_vehicles(vin);
CREATE INDEX IF NOT EXISTS idx_runlist_vehicles_matched ON runlist_vehicles(matched);
CREATE INDEX IF NOT EXISTS idx_autoniq_data_vin ON autoniq_data(vin);
