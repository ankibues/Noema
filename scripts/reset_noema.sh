#!/bin/bash
# =============================================================================
# NOEMA Fresh Reset Script
# Clears ALL persistent data so NOEMA starts from scratch.
# Usage: bash scripts/reset_noema.sh
# =============================================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

echo "═══════════════════════════════════════════════════"
echo "  NOEMA — Full Reset (Starting from Scratch)"
echo "═══════════════════════════════════════════════════"
echo ""

# ── 1. NOEMA Core Data (JSON repositories) ──────────────
echo "🧹 Clearing NOEMA cognitive data..."
DATA_DIR="$PROJECT_ROOT/data"
for f in observations.json mental_models.json experiences.json graph_edges.json \
         actions.json action_outcomes.json plan_cache.json action_sequences.json \
         run_metrics.json; do
  if [ -f "$DATA_DIR/$f" ]; then
    echo "[]" > "$DATA_DIR/$f"
    echo "   ✓ Reset $f"
  fi
done

# Reset identity (new birth date = now)
if [ -f "$DATA_DIR/identity.json" ]; then
  rm "$DATA_DIR/identity.json"
  echo "   ✓ Removed identity.json (will regenerate on startup)"
fi

# ── 2. Screenshots & Videos ──────────────────────────────
echo "🧹 Clearing screenshots and videos..."
SCREENSHOTS_DIR="$PROJECT_ROOT/apps/api/data/screenshots"
VIDEOS_DIR="$PROJECT_ROOT/apps/api/data/videos"

if [ -d "$SCREENSHOTS_DIR" ]; then
  rm -f "$SCREENSHOTS_DIR"/*.png 2>/dev/null
  echo "   ✓ Cleared screenshots"
fi

if [ -d "$VIDEOS_DIR" ]; then
  rm -f "$VIDEOS_DIR"/*.webm 2>/dev/null
  echo "   ✓ Cleared videos"
fi

# ── 3. Logs (optional — keep for debugging) ──────────────
echo "🧹 Clearing logs..."
LOGS_DIR="$PROJECT_ROOT/apps/api/data/logs"
if [ -d "$LOGS_DIR" ]; then
  rm -f "$LOGS_DIR"/*.log 2>/dev/null
  echo "   ✓ Cleared logs"
fi

# ── 4. Cognee semantic memory ─────────────────────────────
echo "🧹 Clearing Cognee semantic memory..."
COGNEE_DATA="$PROJECT_ROOT/apps/cognee_service/cognee_data"
if [ -d "$COGNEE_DATA" ]; then
  rm -rf "$COGNEE_DATA"/*
  echo "   ✓ Cleared Cognee data"
fi

# Also clear Cognee's internal system DB if it exists
COGNEE_SYSTEM="$PROJECT_ROOT/apps/cognee_service/venv/lib/python3.12/site-packages/cognee/.cognee_system"
if [ -d "$COGNEE_SYSTEM" ]; then
  rm -rf "$COGNEE_SYSTEM/databases" 2>/dev/null
  echo "   ✓ Cleared Cognee system databases"
fi

echo ""
echo "═══════════════════════════════════════════════════"
echo "  ✅ NOEMA reset complete!"
echo ""
echo "  Next steps:"
echo "    1. Restart API:    cd apps/api && npm run server"
echo "    2. Restart Cognee: cd apps/cognee_service && uvicorn main:app --host 0.0.0.0 --port 8100 --reload"
echo "    3. Open frontend:  http://localhost:3000"
echo ""
echo "  NOEMA will start fresh with:"
echo "    • Age: 0 days    • Runs: 0"
echo "    • Models: 0      • Experiences: 0"
echo "    • Plan cache: empty"
echo "    • Action sequences: empty"
echo "═══════════════════════════════════════════════════"
