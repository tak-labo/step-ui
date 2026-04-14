#!/bin/sh
set -eu

if [ "${CADDY_ENABLED:-false}" != "true" ]; then
  echo "Caddy disabled; set CADDY_ENABLED=true to enable it."
  exit 0
fi

if [ -z "${PUBLIC_DOMAIN:-}" ]; then
  echo "PUBLIC_DOMAIN must be set when CADDY_ENABLED=true" >&2
  exit 1
fi

rm -rf /data/caddy/certificates/local /data/caddy/pki/authorities/local

exec caddy run --config /etc/caddy/Caddyfile --adapter caddyfile
