#!/bin/sh
set -eu

if [ "${CADDY_ENABLED:-false}" != "true" ]; then
  echo "Caddy disabled; set CADDY_ENABLED=true to enable it."
  exit 0
fi

exec caddy run --config /etc/caddy/Caddyfile --adapter caddyfile
