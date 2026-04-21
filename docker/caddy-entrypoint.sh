#!/bin/sh
set -e

if [ "${CADDY_ENABLED}" != "true" ]; then
  echo "Caddy disabled (CADDY_ENABLED != true). Exiting."
  exit 0
fi

if [ -z "${PUBLIC_DOMAIN}" ]; then
  echo "ERROR: PUBLIC_DOMAIN is not set." >&2
  exit 1
fi

exec caddy run --config /etc/caddy/Caddyfile --adapter caddyfile
