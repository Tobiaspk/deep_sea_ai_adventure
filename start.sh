#!/bin/bash
# Start (or restart) the Dive, Laugh, Love server in the background
# Usage:
#   ./start.sh              # default port 8080
#   ./start.sh 3000         # custom port
#   ./start.sh --ngrok      # default port + public ngrok tunnel
#   ./start.sh 3000 --ngrok # custom port + ngrok tunnel

DIR="$(cd "$(dirname "$0")" && pwd)"
LOG="$DIR/server.log"
NGROK=false
PORT=8080

# Parse arguments (port and --ngrok in any order)
for arg in "$@"; do
  if [[ "$arg" == "--ngrok" ]]; then
    NGROK=true
  elif [[ "$arg" =~ ^[0-9]+$ ]]; then
    PORT="$arg"
  fi
done

# Kill any existing process on the port
lsof -ti:"$PORT" | xargs kill -9 2>/dev/null
sleep 0.3

# Start server in background
nohup node "$DIR/server.js" "$PORT" > "$LOG" 2>&1 &
SERVER_PID=$!
sleep 0.5

# Verify it started
if ! kill -0 "$SERVER_PID" 2>/dev/null; then
  echo "❌  Server failed to start. Check $LOG"
  exit 1
fi

LOCAL_IP=$(ipconfig getifaddr en0 2>/dev/null || echo "unknown")
echo ""
echo "🌊  Dive, Laugh, Love"
echo "─────────────────────────────────"
echo "  Local:   http://localhost:$PORT"
echo "  Network: http://$LOCAL_IP:$PORT"
echo "  PID:     $SERVER_PID"
echo "  Log:     $LOG"

# Start ngrok tunnel if requested
if $NGROK; then
  if ! command -v ngrok &>/dev/null; then
    echo "─────────────────────────────────"
    echo "  ⚠️  ngrok not found. Install it:"
    echo "     brew install ngrok"
    echo ""
    echo "  To stop:  kill $SERVER_PID"
    echo ""
    exit 1
  fi

  # Kill any existing ngrok process
  pkill -f "ngrok http" 2>/dev/null
  sleep 0.3

  # Start ngrok in background
  ngrok http "$PORT" --log=stdout > "$DIR/ngrok.log" 2>&1 &
  NGROK_PID=$!
  sleep 2

  # Extract the public URL from ngrok API
  NGROK_URL=$(curl -s http://127.0.0.1:4040/api/tunnels 2>/dev/null \
    | grep -o '"public_url":"https://[^"]*"' \
    | head -1 \
    | cut -d'"' -f4)

  if [[ -n "$NGROK_URL" ]]; then
    echo "  Public:  $NGROK_URL"
    echo "─────────────────────────────────"
    echo "  Share the Public URL with"
    echo "  remote players anywhere! 🌍"
  else
    echo "─────────────────────────────────"
    echo "  ⚠️  ngrok started but couldn't"
    echo "  detect public URL. Check:"
    echo "     http://127.0.0.1:4040"
  fi

  echo ""
  echo "  To stop:  kill $SERVER_PID $NGROK_PID"
  echo ""
else
  echo "─────────────────────────────────"
  echo "  Share the Network URL with"
  echo "  players on the same Wi-Fi!"
  echo ""
  echo "  Tip: use --ngrok for a public"
  echo "  tunnel to reach remote players."
  echo ""
  echo "  To stop:  kill $SERVER_PID"
  echo ""
fi
