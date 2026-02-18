#!/bin/bash
# Start (or restart) the Dive, Laugh, Love server

PORT="${1:-8080}"

# Kill any existing process on the port
lsof -ti:"$PORT" | xargs kill -9 2>/dev/null
sleep 0.3

# Get local IP
LOCAL_IP=$(ipconfig getifaddr en0 2>/dev/null || echo "unknown")

echo ""
echo "🌊  Dive, Laugh, Love"
echo "─────────────────────────────────"
echo "  Local:   http://localhost:$PORT"
echo "  Network: http://$LOCAL_IP:$PORT"
echo "─────────────────────────────────"
echo "  Share the Network URL with"
echo "  players on the same Wi-Fi!"
echo ""

cd "$(dirname "$0")" && node server.js "$PORT"
