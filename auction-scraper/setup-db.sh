#!/bin/bash
# Setup PostgreSQL database for Auction Intel

echo "=== Auction Intel Database Setup ==="
echo

# Check if PostgreSQL is installed
if ! command -v psql &> /dev/null; then
    echo "❌ PostgreSQL not installed"
    echo "Install with: sudo apt install postgresql postgresql-contrib"
    exit 1
fi

echo "✓ PostgreSQL found"

# Check if PostgreSQL service is running
if ! sudo systemctl is-active --quiet postgresql; then
    echo "Starting PostgreSQL service..."
    sudo systemctl start postgresql
fi

echo "✓ PostgreSQL service running"
echo

# Create database and user
echo "Creating database and user..."
sudo -u postgres psql << EOF
-- Create user if not exists
DO \$\$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_user WHERE usename = 'auction_user') THEN
    CREATE USER auction_user WITH PASSWORD 'auction_pass';
  END IF;
END
\$\$;

-- Create database if not exists
SELECT 'CREATE DATABASE auction_data'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'auction_data')\gexec

-- Grant privileges
GRANT ALL PRIVILEGES ON DATABASE auction_data TO auction_user;
EOF

echo "✓ Database and user created"
echo

# Create tables
echo "Creating tables..."
sudo -u postgres psql -d auction_data -f schema.sql

echo "✓ Tables created"
echo

# Grant table privileges
sudo -u postgres psql -d auction_data << EOF
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO auction_user;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO auction_user;
EOF

echo "✓ Privileges granted"
echo

echo "=== Setup Complete ==="
echo
echo "Database: auction_data"
echo "User: auction_user"
echo "Password: auction_pass"
echo "Host: localhost:5432"
echo
echo "Test connection with:"
echo "psql -U auction_user -d auction_data -h localhost"
