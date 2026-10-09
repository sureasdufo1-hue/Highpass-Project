"""Guest-only certificate assertion probe; never prints assertion or access token."""
import base64
import hashlib
import json
import pathlib
import subprocess
import time
import urllib.request
import urllib.parse
import urllib.error
import uuid

directory = pathlib.Path("/opt/highpass/capstone-key-identity")
configuration = json.loads((directory / "identity.json").read_text())
def encoded(value):
    return base64.urlsafe_b64encode(value).decode().rstrip("=")
try:
    tenant = configuration["tenantId"]
    client = configuration["clientId"]
    if str(uuid.UUID(tenant)) != tenant or str(uuid.UUID(client)) != client:
        raise ValueError("IDENTITY_INVALID")
    endpoint = "https://login.microsoftonline.com/" + tenant + "/oauth2/v2.0/token"
    certificate = subprocess.run(["openssl", "x509", "-in", str(directory / "identity.crt"), "-outform", "DER"], capture_output=True, check=True, timeout=5).stdout
    now = int(time.time())
    header = {"alg": "RS256", "typ": "JWT", "x5t": encoded(hashlib.sha1(certificate).digest())}
    claims = {"aud": endpoint, "iss": client, "sub": client, "iat": now, "nbf": now - 5, "exp": now + 60, "jti": str(uuid.uuid4())}
    assertion_input = ".".join(encoded(json.dumps(value, separators=(",", ":")).encode()) for value in [header, claims]).encode()
    signature = subprocess.run(["openssl", "dgst", "-sha256", "-sign", str(directory / "identity.key")], input=assertion_input, capture_output=True, check=True, timeout=5).stdout
    assertion = assertion_input.decode() + "." + encoded(signature)
    form = urllib.parse.urlencode({"client_id": client, "scope": "https://vault.azure.net/.default", "grant_type": "client_credentials", "client_assertion_type": "urn:ietf:params:oauth:client-assertion-type:jwt-bearer", "client_assertion": assertion}).encode()
    request = urllib.request.Request(endpoint, data=form, headers={"content-type": "application/x-www-form-urlencoded"})
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
    try:
        response = opener.open(request, timeout=10)
    except urllib.error.HTTPError as error:
        response = error
    with response:
        payload = response.read(16385)
        if len(payload) > 16384:
            raise ValueError("RESPONSE_LIMIT")
        data = json.loads(payload)
        valid = response.status == 200 and data.get("token_type") == "Bearer" and isinstance(data.get("access_token"), str) and int(data.get("expires_in", 0)) > 0
        result = {"status": "PASS" if valid else "NOT VERIFIED", "http": response.status, "certificateAuthentication": valid, "tenant": tenant, "clientId": client}
        if not valid:
            result["reason"] = data.get("error", "TOKEN_ENDPOINT_FAILURE")
        assertion = None
        form = None
        data = None
    print(json.dumps(result))
except Exception as error:
    print(json.dumps({"status": "NOT VERIFIED", "reason": type(error).__name__}))
