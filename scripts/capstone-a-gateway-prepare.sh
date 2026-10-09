#!/usr/bin/env bash
set -eu
test "$(id -u)" = 0
test "$(cat /sys/class/net/ens33/address)" = 00:0c:29:25:f6:b4
directory=/opt/highpass/capstone-a-gateway-secrets
test ! -e "$directory"
install -d -o root -g 65532 -m 750 "$directory"
umask 077
openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:2048 -out "$directory/gateway-server.key" 2>/dev/null
chown root:65532 "$directory/gateway-server.key"
chmod 640 "$directory/gateway-server.key"
openssl req -new -key "$directory/gateway-server.key" -subj /CN=highpass-hospital-a-gateway-development-only -out "$1/gateway-server.csr"
chmod 644 "$1/gateway-server.csr"
printf 'GATEWAY_PREPARE=PASS\n'
