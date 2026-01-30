#!/bin/bash
set -e

echo "🗄️  Setting up AutoIntel database..."

# Check if DATABASE_URL is set
if [ -z "$DATABASE_URL" ]; then
  echo "❌ DATABASE_URL not set. Add PostgreSQL database in Railway."
  exit 1
fi

echo "📋 Creating tables..."
psql "$DATABASE_URL" < database/schema.sql

echo "📊 Importing historical sales data..."
node database/import-sales.js

echo "✅ Database setup complete!"
echo ""
echo "📈 Stats:"
psql "$DATABASE_URL" -c "SELECT COUNT(*) as total_sales FROM historical_sales;"
