#!/usr/bin/env bash
# Cloud-only narrow forwarding. No global flush/default policy/Internet routing.
set -euo pipefail
[[ $(id -u) == 0 && $(hostname) == highpass-cloud ]] || exit 2
iface=hp-capstone
state=/etc/highpass/capstone-overlay
ipt() { timeout 5s iptables -w 3 "$@"; }
case ${1:-} in
up)
  ! ipt -S HP-CAP-WG-F >/dev/null 2>&1 || { echo FIREWALL_EXISTING_PRESERVED; exit 3; }
  sysctl -n net.ipv4.ip_forward > "$state/previous-ip-forward"
  chmod 600 "$state/previous-ip-forward"
  ipt -N HP-CAP-WG-F
  ipt -A HP-CAP-WG-F -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT
  ipt -A HP-CAP-WG-F -i "$iface" -s 10.90.88.3/32 -d 10.90.88.2/32 -p tcp --dport 8042 -j DROP
  for source in 10.90.88.2 10.90.88.3; do
    ipt -A HP-CAP-WG-F -i "$iface" -s "$source/32" -d 10.89.1.4/32 -p tcp --dport 443 -j ACCEPT
    # Docker translates the overlay-only host443 socket to container8443 before
    # FORWARD. Original-destination binding prevents an arbitrary bridge permit.
    ipt -A HP-CAP-WG-F -i "$iface" -s "$source/32" -p tcp --dport 8443 -m conntrack --ctstate NEW --ctorigdst 10.90.88.1 --ctorigdstport 443 -j ACCEPT
  done
  ipt -A HP-CAP-WG-F -i "$iface" -o "$iface" -s 10.90.88.3/32 -d 10.90.88.2/32 -p tcp --dport 9443 -j ACCEPT
  ipt -A HP-CAP-WG-F -j DROP
  ipt -N HP-CAP-WG-I
  ipt -A HP-CAP-WG-I -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT
  for source in 10.90.88.2 10.90.88.3; do
    ipt -A HP-CAP-WG-I -s "$source/32" -d 10.90.88.1/32 -p tcp --dport 443 -j ACCEPT
    ipt -A HP-CAP-WG-I -s "$source/32" -d 10.90.88.1/32 -p icmp --icmp-type echo-request -j ACCEPT
    ipt -t nat -A POSTROUTING -s "$source/32" -d 10.89.1.4/32 -p tcp --dport 443 -o eth0 -j MASQUERADE
  done
  ipt -A HP-CAP-WG-I -j DROP
  ipt -I INPUT 1 -i "$iface" -j HP-CAP-WG-I
  ipt -I FORWARD 1 -o "$iface" -j HP-CAP-WG-F
  ipt -I FORWARD 1 -i "$iface" -j HP-CAP-WG-F
  timeout 5s sysctl -q -w net.ipv4.ip_forward=1
  ;;
down)
  # Remove only exact rules/chains owned by this interface; preserve Docker/UFW.
  ipt -D INPUT -i "$iface" -j HP-CAP-WG-I || true
  ipt -D FORWARD -i "$iface" -j HP-CAP-WG-F || true
  ipt -D FORWARD -o "$iface" -j HP-CAP-WG-F || true
  for source in 10.90.88.2 10.90.88.3; do
    ipt -t nat -D POSTROUTING -s "$source/32" -d 10.89.1.4/32 -p tcp --dport 443 -o eth0 -j MASQUERADE || true
  done
  for chain in HP-CAP-WG-F HP-CAP-WG-I; do ipt -F "$chain" || true; ipt -X "$chain" || true; done
  if [[ -f "$state/previous-ip-forward" ]]; then
    previous=$(< "$state/previous-ip-forward")
    [[ $previous =~ ^[01]$ ]] || exit 4
    timeout 5s sysctl -q -w "net.ipv4.ip_forward=$previous"
  fi
  ;;
*) exit 2;;
esac
