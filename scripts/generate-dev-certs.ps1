param(
  [string]$OutputRoot = "tmp/certs"
)

$ErrorActionPreference = "Stop"

$edgeDir = Join-Path $OutputRoot "edge"
$mtlsDir = Join-Path $OutputRoot "mtls"
New-Item -ItemType Directory -Force -Path $edgeDir, $mtlsDir | Out-Null

$resolved = Resolve-Path $OutputRoot
$mountPath = $resolved.Path -replace "\\", "/"
if ($mountPath -match "^[A-Za-z]:") {
  $mountPath = "/" + $mountPath.Substring(0, 1).ToLower() + $mountPath.Substring(2)
}

docker run --rm -v "${mountPath}:/certs" alpine:3.20 sh -lc @'
set -eu
apk add --no-cache openssl >/dev/null
mkdir -p /certs/edge /certs/mtls

openssl req -x509 -newkey rsa:2048 -nodes -days 30 \
  -subj "/CN=hipass-dev-root-ca" \
  -keyout /certs/mtls/ca.key \
  -out /certs/mtls/ca.crt

openssl req -newkey rsa:2048 -nodes \
  -subj "/CN=localhost" \
  -keyout /certs/edge/localhost.key \
  -out /certs/edge/localhost.csr
cat > /certs/edge/localhost.ext <<EOF
subjectAltName=DNS:localhost,IP:127.0.0.1
extendedKeyUsage=serverAuth
EOF
openssl x509 -req -days 30 \
  -in /certs/edge/localhost.csr \
  -CA /certs/mtls/ca.crt \
  -CAkey /certs/mtls/ca.key \
  -CAcreateserial \
  -out /certs/edge/localhost.crt \
  -extfile /certs/edge/localhost.ext

openssl req -newkey rsa:2048 -nodes \
  -subj "/CN=hospital-a-orthanc-mtls" \
  -keyout /certs/mtls/orthanc-server.key \
  -out /certs/mtls/orthanc-server.csr
cat > /certs/mtls/orthanc-server.ext <<EOF
subjectAltName=DNS:hospital-a-orthanc-mtls
extendedKeyUsage=serverAuth
EOF
openssl x509 -req -days 30 \
  -in /certs/mtls/orthanc-server.csr \
  -CA /certs/mtls/ca.crt \
  -CAkey /certs/mtls/ca.key \
  -CAcreateserial \
  -out /certs/mtls/orthanc-server.crt \
  -extfile /certs/mtls/orthanc-server.ext

openssl req -newkey rsa:2048 -nodes \
  -subj "/CN=hipass-gateway-service" \
  -keyout /certs/mtls/gateway-client.key \
  -out /certs/mtls/gateway-client.csr
cat > /certs/mtls/gateway-client.ext <<EOF
extendedKeyUsage=clientAuth
EOF
openssl x509 -req -days 30 \
  -in /certs/mtls/gateway-client.csr \
  -CA /certs/mtls/ca.crt \
  -CAkey /certs/mtls/ca.key \
  -CAcreateserial \
  -out /certs/mtls/gateway-client.crt \
  -extfile /certs/mtls/gateway-client.ext

rm -f /certs/edge/*.csr /certs/edge/*.ext /certs/mtls/*.csr /certs/mtls/*.ext /certs/mtls/*.srl
chmod 644 /certs/edge/*.key /certs/mtls/*.key
chmod 644 /certs/edge/*.crt /certs/mtls/*.crt
'@

Write-Output "Generated development-only TLS/mTLS certificates under $OutputRoot"
