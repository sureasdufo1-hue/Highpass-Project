#!/usr/bin/env bash
# Interactive, bounded Docker Engine install for the dedicated Highpass A/B Ubuntu VM.
# Run as server over SSH with a PTY. sudo prompts locally; no password is accepted via stdin.
set -Eeuo pipefail
export DEBIAN_FRONTEND=noninteractive

fail() { printf 'DOCKER_SETUP=FAIL code=%s\n' "$1" >&2; exit 1; }

authenticate_sudo() {
  case "${HIPASS_DOCKER_SUDO_MODE:-interactive}" in
    interactive) timeout 180s sudo -v ;;
    # Azure's image grants NOPASSWD commands but sudo -v can still demand a
    # password. Verify actual root command permission without changing policy.
    noninteractive) [[ "$(timeout 10s sudo -n id -u)" == 0 ]] || fail SUDO_NONINTERACTIVE_UNAVAILABLE ;;
    *) fail SUDO_MODE_INVALID ;;
  esac
}

if [[ ! -r /etc/os-release ]]; then fail OS_RELEASE_UNAVAILABLE; fi
# shellcheck disable=SC1091
. /etc/os-release
[[ "${ID:-}" == ubuntu && "${VERSION_ID:-}" == '24.04' ]] || fail UNSUPPORTED_UBUNTU_VERSION
[[ "$(dpkg --print-architecture)" == amd64 ]] || fail UNSUPPORTED_ARCHITECTURE
command -v timeout >/dev/null 2>&1 || fail TIMEOUT_COMMAND_MISSING

printf 'guest-hostname=%s\n' "$(hostname -f 2>/dev/null || hostname)"
printf 'guest-os=%s\n' "${PRETTY_NAME:-Ubuntu}"
printf 'docker-cli-before=%s\n' "$(command -v docker || printf ABSENT)"

packages=(docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin)
conflicts=(docker.io docker-compose docker-compose-v2 docker-doc docker-buildx podman-docker containerd runc)
installed=''
for package in "${packages[@]}" "${conflicts[@]}"; do
  state=$(dpkg-query -W -f='${db:Status-Status}' "$package" 2>/dev/null || true)
  if [[ "$state" == installed ]]; then installed+=" $package"; fi
done
if [[ -n "$installed" ]]; then
  printf 'existing-docker-related-packages=%s\n' "$installed"
  if [[ -x /usr/bin/docker ]]; then
    authenticate_sudo
    sudo timeout 30s systemctl enable --now docker
    sudo timeout 15s docker info --format 'docker-engine={{.ServerVersion}}'
    sudo timeout 10s docker compose version
    printf '%s\n' 'DOCKER_SETUP=PASS (existing package set; no package replacement performed)'
    exit 0
  fi
  fail EXISTING_DOCKER_PACKAGE_SET_REQUIRES_REVIEW
fi

if grep -Rqs --include='*.list' --include='*.sources' 'download.docker.com/linux/ubuntu' /etc/apt/sources.list /etc/apt/sources.list.d 2>/dev/null; then
  fail DOCKER_APT_SOURCE_ALREADY_CONFIGURED
fi
if [[ -e /etc/apt/sources.list.d/docker.sources || -e /etc/apt/sources.list.d/docker.list || -e /etc/apt/keyrings/docker.asc ]]; then
  fail DOCKER_APT_CONFIGURATION_ALREADY_EXISTS
fi
if ! timeout 10s getent hosts download.docker.com >/dev/null 2>&1; then fail DOCKER_REPOSITORY_DNS_UNAVAILABLE; fi

authenticate_sudo
timeout 120s sudo -n apt-get -o Acquire::Retries=0 -o Acquire::http::Timeout=20 -o Acquire::https::Timeout=20 update
timeout 120s sudo -n apt-get -o Acquire::Retries=0 -o Acquire::http::Timeout=20 -o Acquire::https::Timeout=20 install -y --no-install-recommends ca-certificates curl
sudo install -m 0755 -d /etc/apt/keyrings
timeout 20s sudo curl -fsSL --connect-timeout 5 --max-time 20 https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc
arch=$(dpkg --print-architecture)
codename=${UBUNTU_CODENAME:-${VERSION_CODENAME:-}}
[[ "$codename" == noble ]] || fail UNEXPECTED_UBUNTU_CODENAME
printf '%s\n' \
  'Types: deb' \
  'URIs: https://download.docker.com/linux/ubuntu' \
  "Suites: $codename" \
  'Components: stable' \
  "Architectures: $arch" \
  'Signed-By: /etc/apt/keyrings/docker.asc' \
  | sudo tee /etc/apt/sources.list.d/docker.sources >/dev/null

timeout 120s sudo -n apt-get -o Acquire::Retries=0 -o Acquire::http::Timeout=20 -o Acquire::https::Timeout=20 update
timeout 240s sudo -n apt-get -o Acquire::Retries=0 -o Acquire::http::Timeout=20 -o Acquire::https::Timeout=20 install -y --no-install-recommends docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo timeout 30s systemctl enable --now docker
sudo timeout 15s docker info --format 'docker-engine={{.ServerVersion}}'
timeout 10s docker compose version
printf '%s\n' 'DOCKER_SETUP=PASS'
