#!/bin/bash
# Start (or restart) the Dive, Laugh, Love server in the background

PORT="${1:-8080}"
DIR="$(cd "$(dirname "$0")" && pwd)"
LOG="$DIR/server.log"

# Kill any existing process on the port
lsof -ti:"$PORT" | xargs kill -9 2>/dev/null
sleep 0.3

# Start server in background
nohup node "$DIR/server.js" "$PORT" > "$LOG" 2>&1 &
SERVER_PID=$!
sleep 0.5

# Verify it started
if kill -0 "$SERVER_PID" 2>/dev/null; then
  LOCAL_IP=$(ipconfig getifaddr en0 2>/dev/null || echo "unknown")
  echo ""
  echo "🌊  Dive, Laugh, Love"
  echo "─────────────────────────────────"
  echo "  Local:   http://localhost:$PORT"
  echo "  Network: http://$LOCAL_IP:$PORT"
  echo "  PID:     $SERVER_PID"
  echo "  Log:     $LOG"
  echo "─────────────────────────────────"
  echo "  Share the Network URL with"
  echo "  players on the same Wi-Fi!"
  echo ""
  echo "  To stop:  kill $SERVER_PID"
  echo ""
else
  echo "❌  Server failed to start. Check $LOG"
  exit 1
fi
