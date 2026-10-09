#!/bin/sh
# Read-only guest inventory. No secrets, container names, clinical files or machine-id.
# Execute inside a dedicated hospital guest: timeout 30s sh workstation-guest-check.sh
set -u
failed=0
unverified=0
printf '%s\n' 'scope=HOSPITAL_GUEST_PREFLIGHT_ONLY' 'review=DRAFT / UNASSIGNED'
if [ -r /etc/os-release ]; then
  . /etc/os-release
  printf 'os=%s\n' "${PRETTY_NAME:-unknown}"
else
  printf '%s\n' 'os=NOT VERIFIED'
  unverified=1
fi
printf 'hostname=%s\n' "$(hostname)"
if command -v ip >/dev/null 2>&1; then
  if ! ip -br -4 address show dev ens33; then
    printf '%s\n' 'network=FAIL'
    failed=1
  fi
else
  printf '%s\n' 'network=NOT VERIFIED'
  unverified=1
fi
if command -v timeout >/dev/null 2>&1 && command -v docker >/dev/null 2>&1; then
  if ! timeout 5s docker --version; then
    printf '%s\n' 'docker-client=FAIL'
    failed=1
  fi
  if ! timeout 5s docker compose version; then
    printf '%s\n' 'compose=FAIL'
    failed=1
  fi
  if timeout 5s docker info --format 'docker-server={{.ServerVersion}}'; then
    printf '%s\n' 'docker-engine=PASS'
  else
    printf '%s\n' 'docker-engine=FAIL (daemon unavailable or current user lacks access)'
    failed=1
  fi
else
  printf '%s\n' 'docker=NOT VERIFIED (Docker or timeout command missing)'
  unverified=1
fi
if command -v ssh-keygen >/dev/null 2>&1; then
  for public_key in /etc/ssh/ssh_host_ed25519_key.pub /etc/ssh/ssh_host_ecdsa_key.pub /etc/ssh/ssh_host_rsa_key.pub; do
    if [ -r "$public_key" ]; then
      ssh-keygen -lf "$public_key" | awk '{print "ssh-host-public-key=" $1 " " $2 " " $NF}'
    fi
  done
fi
printf '%s\n' 'application=NOT VERIFIED' 'key-vault=NOT VERIFIED' 'cross-hospital-e2e=NOT VERIFIED'
# Infrastructure success is NOT an application/MVP success.
if [ "$failed" -ne 0 ]; then exit 1; fi
if [ "$unverified" -ne 0 ]; then exit 2; fi
exit 0
