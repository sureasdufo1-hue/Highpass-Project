#!/usr/bin/env bash
set -eu
# Development-only external files. No values printed; CA private key stays local.
test "$(hostname)" = highpass-cloud
test "$(id -u)" = 0
secret_dir=/opt/highpass/capstone-control-secrets
test ! -e "$secret_dir"
install -d -o root -g 65532 -m 750 "$secret_dir"
umask 077
for name in admin-password app-password token-secret test-auth-secret ingress-secret data-plane-secret; do
  openssl rand -hex 32 > "$secret_dir/$name"
  # Readers require a single value without a trailing newline.
  truncate -s -1 "$secret_dir/$name"
  chown root:65532 "$secret_dir/$name"
  chmod 640 "$secret_dir/$name"
done
openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:2048 -out "$secret_dir/cloud-server.key" 2>/dev/null
chown root:65532 "$secret_dir/cloud-server.key"
chmod 640 "$secret_dir/cloud-server.key"
openssl req -new -key "$secret_dir/cloud-server.key" -subj /CN=highpass-capstone-cloud-development-only -addext 'subjectAltName=IP:10.90.88.1,DNS:highpass-capstone-cloud.invalid' -out "$1/cloud-server.csr"
chmod 644 "$1/cloud-server.csr"
printf 'CLOUD_PREPARE=PASS\n'
