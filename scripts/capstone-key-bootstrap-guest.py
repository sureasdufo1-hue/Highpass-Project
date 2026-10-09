"""One-off private-network operator bootstrap, NOT Control API application code."""
import json
import re
import sys
import time
import urllib.request
import urllib.error
import socket

base = "https://kv-hp-demo-4869edd9.vault.azure.net/keys/capstone-b-kek-20261009"
try:
    material = sys.stdin.buffer.read(32769)
    if len(material) > 32768:
        raise ValueError("INPUT_LIMIT")
    token = json.loads(material)["token"]
    material = None
    if not isinstance(token, str) or not re.fullmatch(r"[A-Za-z0-9._~-]{1,16384}", token):
        raise ValueError("TOKEN_INVALID")
    addresses = {item[4][0] for item in socket.getaddrinfo("kv-hp-demo-4869edd9.vault.azure.net", 443, type=socket.SOCK_STREAM)}
    if addresses != {"10.89.1.4"}:
        raise ValueError("PRIVATE_DNS_REQUIRED")
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
    def call(path, body=None):
        request = urllib.request.Request(base + path, data=None if body is None else json.dumps(body).encode(), headers={"authorization": "Bearer " + token, "content-type": "application/json"})
        try:
            response = opener.open(request, timeout=10)
        except urllib.error.HTTPError as error:
            response = error
        with response:
            payload = response.read(16385)
            if len(payload) > 16384:
                raise ValueError("RESPONSE_LIMIT")
            return response.status, json.loads(payload)
    status, _ = call("?api-version=2025-07-01")
    deadline = time.monotonic() + 90
    while status == 403 and time.monotonic() < deadline:
        time.sleep(5)
        status, _ = call("?api-version=2025-07-01")
    if status != 404:
        raise ValueError("EXISTING_KEY_OR_BOOTSTRAP_PERMISSION_NOT_VERIFIED")
    status, response = call("/create?api-version=2025-07-01", {"kty": "RSA", "key_size": 2048, "key_ops": ["wrapKey", "unwrapKey"], "attributes": {"enabled": True, "exp": 1794155400}, "tags": {"environment": "CAPSTONE_SYNTHETIC_ONLY", "owner": "highpass-capstone"}})
    key = response.get("key", {})
    valid = status == 200 and key.get("kty") == "RSA" and set(key.get("key_ops", [])) == {"wrapKey", "unwrapKey"} and re.fullmatch(re.escape(base) + r"/[a-f0-9]{32}", key.get("kid", "")) is not None
    result = {"status": "PASS" if valid else "NOT VERIFIED", "http": status, "keyId": key.get("kid") if valid else None, "privateDns": "10.89.1.4", "expiry": 1794155400}
    token = None
    print(json.dumps(result))
except Exception as error:
    print(json.dumps({"status": "NOT VERIFIED", "reason": str(error) if isinstance(error, ValueError) else type(error).__name__}))
