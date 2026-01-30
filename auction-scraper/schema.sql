-- Core vehicle data
CREATE TABLE vehicles (
  vin TEXT,
  auction_name TEXT,
  cr_score REAL,
  raw_announcements TEXT,
  scraped_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (vin, auction_name)
);

-- Announcement catalog (learns as you go)
CREATE TABLE announcements (
  id SERIAL PRIMARY KEY,
  announcement_text TEXT UNIQUE,
  auction_name TEXT,
  interest_score INTEGER DEFAULT 0,  -- 0=unknown, 1-5=your scoring
  notes TEXT,
  first_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Link vehicles to parsed announcements
CREATE TABLE vehicle_announcements (
  vin TEXT,
  announcement_id INTEGER,
  FOREIGN KEY (announcement_id) REFERENCES announcements(id)
);

-- Index for faster queries
CREATE INDEX idx_announcements_score ON announcements(interest_score);
CREATE INDEX idx_vehicles_vin ON vehicles(vin);
