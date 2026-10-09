"""Run as root on the cloud; credential stays inside this process/file boundary."""
import http.client
import json
import pathlib
import ssl
import sys

context = ssl.create_default_context(cafile=sys.argv[1])
token = pathlib.Path("/opt/highpass/capstone-control-secrets/data-plane-secret").read_text().strip()
checks = []
for route in ["/gateway/data-plane/authorize", "/gateway/data-plane/ready"]:
    for valid in [False, True]:
        connection = http.client.HTTPSConnection("10.90.88.1", timeout=5, context=context)
        try:
            connection.request("POST", route, body="{}", headers={"content-type": "application/json", "x-hipass-service-token": token if valid else "synthetic-invalid-service-token"})
            response = connection.getresponse()
            body = json.loads(response.read(32769))
            if valid:
                expected_status, expected_reason = (400, "DATA_PLANE_REQUEST_INVALID") if route.endswith("authorize") else (403, "DATA_PLANE_RECEIPT_INVALID")
                expected = response.status == expected_status and body.get("reason") == expected_reason
            else:
                expected = response.status == 401
            checks.append({"test": route + (":VALID_SERVICE_INVALID_INPUT" if valid else ":INVALID_SERVICE"), "status": "PASS" if expected else "NOT VERIFIED", "httpStatus": response.status, "reason": body.get("reason")})
        finally:
            connection.close()
token = None
print(json.dumps({"checks": checks, "status": "PASS" if all(item["status"] == "PASS" for item in checks) else "NOT VERIFIED"}))
sys.exit(0 if all(item["status"] == "PASS" for item in checks) else 1)
