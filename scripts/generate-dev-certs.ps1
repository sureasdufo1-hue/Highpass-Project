param(
  [string]$OutputRoot = "tmp/certs",
  [ValidateRange(31, 397)]
  [int]$ValidityDays = 90
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

docker run --rm -e "HIPASS_CERT_DAYS=$ValidityDays" -v "${mountPath}:/certs" alpine:3.20 sh -lc @'
set -eu
apk add --no-cache openssl >/dev/null
mkdir -p /certs/edge /certs/mtls

openssl req -x509 -newkey rsa:2048 -nodes -days "${HIPASS_CERT_DAYS}" \
  -subj "/CN=hipass-dev-root-ca" \
  -addext "basicConstraints=critical,CA:TRUE,pathlen:0" \
  -addext "keyUsage=critical,keyCertSign,cRLSign" \
  -keyout /certs/mtls/ca.key \
  -out /certs/mtls/ca.crt

openssl req -newkey rsa:2048 -nodes \
  -subj "/CN=localhost" \
  -keyout /certs/edge/localhost.key \
  -out /certs/edge/localhost.csr
cat > /certs/edge/localhost.ext <<EOF
subjectAltName=DNS:localhost,IP:127.0.0.1
keyUsage=critical,digitalSignature,keyEncipherment
extendedKeyUsage=serverAuth
EOF
openssl x509 -req -days "${HIPASS_CERT_DAYS}" \
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
keyUsage=critical,digitalSignature,keyEncipherment
extendedKeyUsage=serverAuth
EOF
openssl x509 -req -days "${HIPASS_CERT_DAYS}" \
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
subjectAltName=URI:spiffe://highpass.local/gateway/hipass-gateway-service
keyUsage=critical,digitalSignature,keyEncipherment
extendedKeyUsage=clientAuth
EOF
openssl x509 -req -days "${HIPASS_CERT_DAYS}" \
  -in /certs/mtls/gateway-client.csr \
  -CA /certs/mtls/ca.crt \
  -CAkey /certs/mtls/ca.key \
  -CAcreateserial \
  -out /certs/mtls/gateway-client.crt \
  -extfile /certs/mtls/gateway-client.ext

rm -f /certs/edge/*.csr /certs/edge/*.ext /certs/mtls/*.csr /certs/mtls/*.ext /certs/mtls/*.srl
# Docker Desktop bind mounts run the app as a non-root UID. Keys remain outside Git
# and are mounted read-only by Compose; host ACLs are the security boundary on Windows.
chmod 644 /certs/edge/*.key /certs/mtls/*.key
chmod 644 /certs/edge/*.crt /certs/mtls/*.crt
'@

Write-Output "Generated development-only TLS/mTLS certificates under $OutputRoot"
