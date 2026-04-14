#!/bin/bash
set -euo pipefail

# step-ca の公式 CLI で admin provisioner の claims を更新する one-shot job。
provisioner_name="${DOCKER_STEPCA_INIT_PROVISIONER_NAME:-admin}"
passfile="${PWDPATH:-/home/step/secrets/password}"

if [ ! -f "$passfile" ]; then
  echo "missing step-ca password file: $passfile" >&2
  exit 1
fi

step ca provisioner update "$provisioner_name" \
  --x509-min-dur=5m \
  --x509-max-dur=87600h \
  --x509-default-dur=24h \
  --admin-password-file "$passfile" \
  --admin-subject step \
  --admin-provisioner "$provisioner_name" \
  --ca-url https://step-ca:9000 \
  --root /home/step/certs/root_ca.crt

if ! step ca provisioner list \
  --ca-url https://step-ca:9000 \
  --root /home/step/certs/root_ca.crt \
  | grep -qw 'acme'; then
  admin_cert="/tmp/step-admin-cert-$$-$RANDOM.crt"
  admin_key="/tmp/step-admin-key-$$-$RANDOM.key"
  trap 'rm -f "$admin_cert" "$admin_key"' EXIT

  step ca certificate step "$admin_cert" "$admin_key" \
    --ca-url https://step-ca:9000 \
    --root /home/step/certs/root_ca.crt \
    --provisioner "$provisioner_name" \
    --provisioner-password-file "$passfile" \
    --not-after 5m \
    --force

  step ca provisioner add acme \
    --type ACME \
    --admin-cert "$admin_cert" \
    --admin-key "$admin_key" \
    --ca-url https://step-ca:9000 \
    --root /home/step/certs/root_ca.crt
fi
