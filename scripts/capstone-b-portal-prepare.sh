#!/usr/bin/env bash
set -eu
test "$(id -u)" = 0
test "$(cat /sys/class/net/ens33/address)" = 00:0c:29:a3:9e:1b
directory=/opt/highpass/capstone-b-portal-secrets
test ! -e "$directory"
install -d -o root -g 65532 -m 750 "$directory"
umask 077
openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:2048 -out "$directory/b-server.key" 2>/dev/null
chown root:65532 "$directory/b-server.key"
chmod 640 "$directory/b-server.key"
openssl req -new -key "$directory/b-server.key" -subj /CN=highpass-hospital-b-portal-development-only -out "$1/b-server.csr"
chmod 644 "$1/b-server.csr"
printf 'B_PORTAL_PREPARE=PASS\n'
