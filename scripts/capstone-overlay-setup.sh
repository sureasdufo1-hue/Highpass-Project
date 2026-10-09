#!/usr/bin/env bash
# Approved synthetic A/B/cloud only. Private keys never leave their own hosts.
set -euo pipefail
[[ $(id -u) == 0 ]] || exit 2
mode=${1:-}; role=${2:-}
case $role in
A) [[ $(cat /sys/class/net/ens33/address) == 00:0c:29:25:f6:b4 ]]; address=10.90.88.2; other=10.90.88.3;;
B) [[ $(cat /sys/class/net/ens33/address) == 00:0c:29:a3:9e:1b ]]; address=10.90.88.3; other=10.90.88.2;;
C) [[ $(hostname) == highpass-cloud ]]; address=10.90.88.1;;
*) exit 2;;
esac
. /etc/os-release
[[ $ID == ubuntu && $VERSION_ID == 24.04 ]] || exit 2
state=/etc/highpass/capstone-overlay
conf=/etc/wireguard/hp-capstone.conf
if [[ $mode == prepare ]]; then
  if ! command -v wg >/dev/null; then
    ! pgrep -x apt-get >/dev/null && ! pgrep -x dpkg >/dev/null || { echo PACKAGE_MANAGER_BUSY; exit 3; }
    export DEBIAN_FRONTEND=noninteractive
    timeout 180s apt-get -o Acquire::Retries=1 -o Acquire::http::Timeout=15 -o Acquire::https::Timeout=15 update >/dev/null
    timeout 180s apt-get -o DPkg::Lock::Timeout=15 -o Acquire::Retries=1 -o Acquire::http::Timeout=15 -o Acquire::https::Timeout=15 install -y --no-install-recommends wireguard-tools >/dev/null
  fi
  [[ ! -L $state && ! -L $state/private.key ]] || exit 4
  install -d -o root -g root -m 700 "$state"
  if [[ ! -e $state/private.key ]]; then
    umask 077
    wg genkey > "$state/private.key"
  fi
  [[ $(stat -c '%U:%G:%a' "$state/private.key") == root:root:600 ]] || exit 4
  printf 'PUBLIC_KEY='
  timeout 5s wg pubkey < "$state/private.key"
  echo PREPARE=PASS
  exit 0
fi
[[ $mode == configure && $# == 5 && ! -e $conf ]] || { echo EXISTING_CONFIGURATION_PRESERVED; exit 3; }
for key in "$3" "$4" "$5"; do [[ $key =~ ^[A-Za-z0-9+/]{43}=$ ]] || exit 4; done
! ip link show hp-capstone >/dev/null 2>&1 || exit 3
if [[ $role == C ]]; then
  ! timeout 5s iptables -w 3 -S HP-CAP-WG-F >/dev/null 2>&1 || exit 3
  ! timeout 5s iptables -w 3 -S HP-CAP-WG-I >/dev/null 2>&1 || exit 3
fi
# Exact route/address collision check is done by the orchestrator before this call.
install -d -m 700 /etc/wireguard
umask 077
{
  printf '[Interface]\nAddress = %s/32\nMTU = 1380\nPostUp = wg set %%i private-key %s/private.key\n' "$address" "$state"
  if [[ $role == C ]]; then
    printf 'ListenPort = 51820\nPostUp = bash %s/firewall.sh up\nPostDown = bash %s/firewall.sh down\n' "$state" "$state"
    printf '\n[Peer]\nPublicKey = %s\nAllowedIPs = 10.90.88.2/32\n' "$4"
    printf '\n[Peer]\nPublicKey = %s\nAllowedIPs = 10.90.88.3/32\n' "$5"
  else
    printf '\n[Peer]\nPublicKey = %s\nEndpoint = 138.91.2.60:51820\nAllowedIPs = 10.90.88.1/32, %s/32, 10.89.1.4/32\nPersistentKeepalive = 25\n' "$3" "$other"
  fi
} > "$conf"
rollback() {
  timeout 20s wg-quick down hp-capstone >/dev/null 2>&1 || true
  if [[ $role == C ]]; then timeout 30s bash "$state/firewall.sh" down >/dev/null 2>&1 || true; fi
  mv -- "$conf" "$state/failed-config-$(date +%s).conf"
  echo OVERLAY_CONFIGURE=FAIL
}
trap rollback ERR
if [[ $role == C ]]; then
  install -o root -g root -m 700 "$(dirname "$0")/firewall.sh" "$state/firewall.sh"
fi
timeout 45s systemctl start wg-quick@hp-capstone
timeout 5s systemctl is-active --quiet wg-quick@hp-capstone
timeout 10s systemctl enable wg-quick@hp-capstone >/dev/null
trap - ERR
printf 'OVERLAY_CONFIGURE=PASS\naddress=%s\n' "$address"
