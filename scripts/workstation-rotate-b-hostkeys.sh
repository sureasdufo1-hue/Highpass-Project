#!/usr/bin/env bash
# Root-only, verified B guest. Backups remain root-readable; no private key output.
set -Eeuo pipefail
[[ "$(id -u)" == 0 ]] || exit 1
[[ "$(cat /sys/class/net/ens33/address)" == 00:0c:29:a3:9e:1b ]] || exit 1
backup=$(mktemp -d /etc/ssh/highpass-capstone-hostkeys.XXXXXX)
chmod 700 "$backup"
types=(ed25519 ecdsa rsa)
rollback() {
  for type in "${types[@]}"; do
    for suffix in '' .pub; do
      name="ssh_host_${type}_key${suffix}"
      if [[ -e "$backup/$name" ]]; then
        if [[ -e "/etc/ssh/$name" ]]; then mv "/etc/ssh/$name" "$backup/new-failed-$name"; fi
        cp -p "$backup/$name" "/etc/ssh/$name"
      fi
    done
  done
  /usr/sbin/sshd -t && timeout 15s systemctl reload ssh || true
  printf '%s\n' 'HOST_KEY_ROTATION=FAIL_ROLLED_BACK' >&2
}
trap rollback ERR
for type in "${types[@]}"; do
  for suffix in '' .pub; do
    name="ssh_host_${type}_key${suffix}"
    if [[ -e "/etc/ssh/$name" ]]; then mv "/etc/ssh/$name" "$backup/$name"; fi
  done
done
timeout 30s ssh-keygen -A
/usr/sbin/sshd -t
timeout 15s systemctl reload ssh
trap - ERR
printf 'root-only-backup=%s\n' "$backup"
ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub
printf '%s\n' 'HOST_KEY_ROTATION=PASS'
