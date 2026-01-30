-- Historical Sales Data
CREATE TABLE IF NOT EXISTS historical_sales (
  id SERIAL PRIMARY KEY,
  date_sold DATE,
  stock_nbr VARCHAR(50),
  vin VARCHAR(17) NOT NULL,
  year INTEGER,
  make VARCHAR(50),
  model VARCHAR(50),
  purchase_price DECIMAL(10,2),
  total_repairs DECIMAL(10,2),
  total_cost DECIMAL(10,2),
  sales_price DECIMAL(10,2),
  gross_profit DECIMAL(10,2),
  net_profit DECIMAL(10,2),
  days_to_sell INTEGER,
  location VARCHAR(100),
  purchased_from VARCHAR(100),
  primary_name VARCHAR(100),
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
  lane VARCHAR(50),
  lot VARCHAR(50),
  matched BOOLEAN DEFAULT FALSE,
  match_count INTEGER DEFAULT 0, -- How many similar vehicles in history
  avg_profit DECIMAL(10,2), -- Average profit from similar vehicles
  avg_days_to_sell INTEGER,
  scraped BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
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
