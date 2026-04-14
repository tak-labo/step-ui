#!/bin/bash
set -euo pipefail

if [ "${NGINX_ENABLED:-false}" != "true" ]; then
  exit 0
fi

public_domain="${PUBLIC_DOMAIN:-localhost}"
provisioner_name="${CA_PROVISIONER:-admin}"
passfile="${PWDPATH:-/home/step/secrets/password}"

if [ ! -f "$passfile" ]; then
  echo "missing step-ca password file: $passfile" >&2
  exit 1
fi

mkdir -p /certs
step ca certificate "$public_domain" /certs/tls.crt /certs/tls.key \
  --ca-url https://step-ca:9000 \
  --root /home/step/certs/root_ca.crt \
  --provisioner "$provisioner_name" \
  --provisioner-password-file "$passfile" \
  --not-after 24h \
  --force
