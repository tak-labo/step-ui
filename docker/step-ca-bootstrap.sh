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
  --x509-default-dur=720h \
  --admin-password-file "$passfile" \
  --admin-subject step \
  --admin-provisioner "$provisioner_name" \
  --ca-url https://step-ca:9000 \
  --root /home/step/certs/root_ca.crt
