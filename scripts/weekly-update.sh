#!/bin/bash
set -e

echo "📊 Weekly Sales Data Update"
echo ""

# Check if sales-data.csv exists
if [ ! -f "./sales-data.csv" ]; then
  echo "❌ sales-data.csv not found!"
  echo "   Place your updated export in the project root."
  exit 1
fi

# Backup current database
echo "💾 Creating backup..."
BACKUP_FILE="backups/historical_sales_$(date +%Y%m%d_%H%M%S).sql"
mkdir -p backups
pg_dump "$DATABASE_URL" -t historical_sales > "$BACKUP_FILE"
echo "   Saved to $BACKUP_FILE"

# Run incremental import
echo ""
echo "🔄 Importing updated data..."
node database/import-sales-incremental.js

# Show updated stats
echo ""
echo "📈 Updated Stats:"
psql "$DATABASE_URL" -c "
  SELECT 
    COUNT(*) as total_sales,
    COUNT(DISTINCT make) as unique_makes,
    COUNT(DISTINCT CONCAT(year, ' ', make, ' ', model)) as unique_vehicles,
    MIN(date_sold) as oldest_sale,
    MAX(date_sold) as newest_sale,
    ROUND(AVG(gross_profit)::numeric, 2) as avg_gross_profit,
    ROUND(AVG(net_profit)::numeric, 2) as avg_net_profit,
    ROUND(AVG(days_to_sell)::numeric, 0) as avg_days_to_sell
  FROM historical_sales;
"

echo ""
echo "✅ Weekly update complete!"
