#!/usr/bin/env bash
# Read-only diagnostics after an incomplete install. No secrets or process args.
set -u
printf '%s\n' 'scope=HOSPITAL_INSTALL_DIAGNOSTICS_ONLY'
printf 'hostname=%s\n' "$(hostname)"
printf 'docker-cli=%s\n' "$(command -v docker || printf ABSENT)"
for package in docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin; do
  printf 'package=%s state=' "$package"
  timeout 5s dpkg-query -W -f='${db:Status-Status}\n' "$package" 2>/dev/null || printf '%s\n' 'ABSENT_OR_UNVERIFIED'
done
printf '%s\n' 'package-processes-command-and-age-only:'
timeout 5s ps -C apt-get,apt,dpkg,sudo -o comm=,etime= || true
printf 'docker-service='
timeout 5s systemctl is-active docker 2>/dev/null || true
if command -v docker >/dev/null 2>&1; then
  timeout 5s docker --version || true
  timeout 5s docker compose version || true
  # Never prompt for sudo during diagnostics; failed permission is not daemon failure.
  timeout 5s sudo -n docker info --format 'docker-engine={{.ServerVersion}}' 2>/dev/null || printf '%s\n' 'docker-engine=NOT VERIFIED (root permission or daemon unavailable)'
fi
printf '%s\n' 'diagnostics=COLLECTED' 'application=NOT VERIFIED'
