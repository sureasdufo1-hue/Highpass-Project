import base64, json, re, sys
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parents[1]
errors = []

def fail(message): errors.append(message)

def pointer(document, ref):
    if not ref.startswith("#/"): return None
    value = document
    for part in ref[2:].split("/"):
        value = value[part.replace("~1", "/").replace("~0", "~")]
    return value

def walk_refs(value, document, location="$"):
    if isinstance(value, dict):
        if "$ref" in value:
            try: pointer(document, value["$ref"])
            except Exception: fail(f"unresolved ref {value['$ref']} at {location}")
        for key, child in value.items(): walk_refs(child, document, f"{location}/{key}")
    elif isinstance(value, list):
        for index, child in enumerate(value): walk_refs(child, document, f"{location}/{index}")

def validate_openapi():
    path = ROOT / "docs/api/highpass-mobile-core.openapi.yaml"
    document = yaml.safe_load(path.read_text(encoding="utf-8"))
    if document.get("openapi") != "3.1.0": fail("OpenAPI version is not 3.1.0")
    walk_refs(document, document)
    operations = document.get("components", {}).get("x-operations", {})
    ids = [operation.get("operationId") for operation in operations.values() if isinstance(operation, dict)]
    if None in ids: fail("operationId missing")
    duplicates = sorted({item for item in ids if ids.count(item) > 1})
    if duplicates: fail(f"duplicate operationId: {duplicates}")
    for path_template, path_item in document.get("paths", {}).items():
        expected = set(re.findall(r"{([^}]+)}", path_template))
        declared = set()
        for parameter in path_item.get("parameters", []):
            resolved = pointer(document, parameter["$ref"]) if "$ref" in parameter else parameter
            if resolved.get("in") == "path" and resolved.get("required") is True:
                declared.add(resolved.get("name"))
        if expected != declared: fail(f"path parameters mismatch {path_template}: expected={expected} declared={declared}")
    schemes = document.get("components", {}).get("securitySchemes", {})
    for required in ("oidc", "oauth2", "mutualTLS", "internalServiceToken"):
        if required not in schemes: fail(f"security scheme missing: {required}")
    for name, operation in operations.items():
        if name in {"startLogin", "oidcCallback", "readInstitution", "readPermissions"}: continue
        for field in ("x-audit-event", "x-rate-limit"):
            if field not in operation: fail(f"{name} missing {field}")
    return len(document.get("paths", {})), len(ids)

def resolve_local(schema, ref):
    return pointer(schema, ref)

def validate(instance, schema, root, location="$"):
    if "$ref" in schema: return validate(instance, resolve_local(root, schema["$ref"]), root, location)
    if "const" in schema and instance != schema["const"]: fail(f"{location}: const")
    if "enum" in schema and instance not in schema["enum"]: fail(f"{location}: enum")
    expected = schema.get("type")
    type_ok = {"object": isinstance(instance, dict), "array": isinstance(instance, list), "string": isinstance(instance, str), "integer": isinstance(instance, int) and not isinstance(instance, bool), "boolean": isinstance(instance, bool)}
    if expected in type_ok and not type_ok[expected]: fail(f"{location}: type {expected}"); return
    if isinstance(instance, dict):
        for key in schema.get("required", []):
            if key not in instance: fail(f"{location}: required {key}")
        properties = schema.get("properties", {})
        if schema.get("additionalProperties") is False:
            for key in instance:
                if key not in properties: fail(f"{location}: additional {key}")
        for key, value in instance.items():
            if key in properties: validate(value, properties[key], root, f"{location}.{key}")
    if isinstance(instance, list):
        if len(instance) < schema.get("minItems", 0): fail(f"{location}: minItems")
        if len(instance) > schema.get("maxItems", 10**18): fail(f"{location}: maxItems")
        for index, item in enumerate(instance): validate(item, schema.get("items", {}), root, f"{location}[{index}]")
    if isinstance(instance, str):
        if "pattern" in schema and not re.fullmatch(schema["pattern"], instance): fail(f"{location}: pattern")
        if len(instance) > schema.get("maxLength", 10**18): fail(f"{location}: maxLength")
        if schema.get("contentEncoding") == "base64url":
            if not re.fullmatch(r"[A-Za-z0-9_-]+", instance): fail(f"{location}: base64url")
            else:
                try: base64.urlsafe_b64decode(instance + "=" * (-len(instance) % 4))
                except Exception: fail(f"{location}: base64url decode")
    if isinstance(instance, int):
        if instance < schema.get("minimum", -10**30): fail(f"{location}: minimum")
        if instance > schema.get("maximum", 10**30): fail(f"{location}: maximum")

def fixture_should(schema_name, fixture_name, valid):
    schema = json.loads((ROOT / "schemas" / schema_name).read_text(encoding="utf-8"))
    instance = json.loads((ROOT / "test/fixtures/phase1" / fixture_name).read_text(encoding="utf-8"))
    before = len(errors); validate(instance, schema, schema); failed = len(errors) > before
    if valid and failed: fail(f"valid fixture rejected: {fixture_name}")
    if not valid and not failed: fail(f"invalid fixture accepted: {fixture_name}")
    if not valid and failed: del errors[before:]

def validate_schemas():
    fixture_should("highpass-package-envelope.schema.json", "package-envelope.valid.json", True)
    fixture_should("highpass-package-envelope.schema.json", "package-envelope.patient-name.invalid.json", False)
    fixture_should("highpass-package-envelope.schema.json", "package-envelope.study-uid.invalid.json", False)
    fixture_should("highpass-package-envelope.schema.json", "package-envelope.base64url.invalid.json", False)
    fixture_should("highpass-key-envelope.schema.json", "key-envelope.plaintext-dek.invalid.json", False)
    fixture_should("highpass-imaging-manifest.schema.json", "manifest-state.invalid.json", False)
    manifest = json.loads((ROOT / "test/fixtures/phase1/manifest-chunks.invalid.json").read_text(encoding="utf-8"))
    if manifest["declaredChunkCount"] == len(manifest["chunkHashes"]): fail("chunk mismatch fixture did not mismatch")
    qr = json.loads((ROOT / "test/fixtures/phase1/qr-jwt.invalid.json").read_text(encoding="utf-8"))["qrPayload"]
    if len(qr.split("t=", 1)[-1].split(".")) == 3: pass
    else: fail("QR JWT fixture not detected")
    for path in (ROOT / "schemas").glob("*.cddl"):
        text = path.read_text(encoding="utf-8")
        if "{" not in text or "}" not in text: fail(f"CDDL map missing: {path.name}")
    manifest_cddl = (ROOT / "schemas/highpass-imaging-manifest.cddl").read_text(encoding="utf-8")
    receipt_cddl = (ROOT / "schemas/highpass-delivery-receipt.cddl").read_text(encoding="utf-8")
    if "deterministic encoding" not in manifest_cddl.lower(): fail("manifest deterministic encoding rule missing")
    if "signature covers deterministic encoding" not in receipt_cddl.lower(): fail("receipt signature range missing")

paths, operations = validate_openapi()
validate_schemas()
if errors:
    print(json.dumps({"result":"FAIL","errors":errors}, ensure_ascii=False, indent=2)); sys.exit(1)
print(json.dumps({"result":"PASS","openapiPaths":paths,"operationIds":operations,"jsonFixtures":8,"cddlFiles":4}))
