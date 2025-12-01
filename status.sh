#!/bin/bash

echo "╔════════════════════════════════════════════════════════════════╗"
echo "║         Tarko Inventory - Deployment Status Check             ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo ""

# Check if services are running
echo "📊 Service Status:"
docker-compose ps
echo ""

# Health checks
echo "🏥 Health Checks:"
echo ""

echo -n "Backend API: "
if curl -s -f http://localhost:5500/api/health > /dev/null 2>&1; then
    echo "✅ Healthy"
else
    echo "❌ Not responding"
fi

echo -n "Frontend: "
if curl -s -f http://localhost > /dev/null 2>&1; then
    echo "✅ Healthy"
else
    echo "❌ Not responding"
fi

echo -n "Database: "
if docker exec tarko-postgres pg_isready -U tarko_user -d tarko_inventory > /dev/null 2>&1; then
    echo "✅ Ready"
else
    echo "❌ Not ready"
fi

echo ""

# Disk usage
echo "💾 Storage Usage:"
echo ""
echo "Snapshots:"
du -sh ./snapshots 2>/dev/null || echo "  No snapshots yet"
echo ""
echo "Backups:"
du -sh ./backups 2>/dev/null || echo "  No backups yet"
echo ""
echo "Uploads:"
du -sh ./backend/uploads 2>/dev/null || echo "  No uploads yet"
echo ""

# Latest snapshot
echo "📸 Latest Snapshots:"
ls -lt ./snapshots | head -5 2>/dev/null || echo "  No snapshots found"
echo ""

# Logs summary
echo "📝 Recent Logs (last 10 lines):"
echo ""
docker-compose logs --tail=10 --no-log-prefix
echo ""

echo "╔════════════════════════════════════════════════════════════════╗"
echo "║                     Status Check Complete                     ║"
echo "╚════════════════════════════════════════════════════════════════╝"
