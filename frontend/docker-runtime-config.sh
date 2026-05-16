#!/bin/sh
set -eu

API_URL="${API_BASE_URL:-${VITE_API_BASE_URL:-http://localhost:8000/api/v1}}"
WS_URL="${WS_BASE_URL:-${VITE_WS_URL:-ws://localhost:8000/api/v1/chat/ws}}"

cat > /usr/share/nginx/html/config.js <<EOF
window.__APP_CONFIG__ = {
  API_BASE_URL: "${API_URL}",
  WS_BASE_URL: "${WS_URL}"
};
EOF
