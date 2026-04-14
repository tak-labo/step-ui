#!/bin/sh
set -eu

if [ "${NGINX_ENABLED:-false}" != "true" ]; then
  echo "nginx disabled; set NGINX_ENABLED=true to enable it."
  exit 0
fi

if [ -z "${PUBLIC_DOMAIN:-}" ]; then
  echo "PUBLIC_DOMAIN must be set when NGINX_ENABLED=true" >&2
  exit 1
fi

cat > /etc/nginx/conf.d/default.conf <<EOF
server {
    listen 80;
    server_name ${PUBLIC_DOMAIN};
    return 301 https://\$host\$request_uri;
}

server {
    listen 443 ssl;
    server_name ${PUBLIC_DOMAIN};

    ssl_certificate /etc/nginx/certs/tls.crt;
    ssl_certificate_key /etc/nginx/certs/tls.key;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_prefer_server_ciphers on;

    location = /acme/ {
        return 301 /acme;
    }

    location /step-ca/acme/ {
        proxy_pass https://step-ca:9000/acme/;
        proxy_set_header Host step-ca;
        proxy_set_header X-Forwarded-Proto https;
        proxy_ssl_server_name on;
        proxy_ssl_name step-ca;
        proxy_ssl_trusted_certificate /home/step/certs/root_ca.crt;
        proxy_ssl_verify on;
    }

    location / {
        proxy_pass http://step-ui:3000;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
    }
}
EOF

exec /docker-entrypoint.sh nginx -g 'daemon off;'
