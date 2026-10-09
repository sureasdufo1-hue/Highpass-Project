"""Ephemeral credential construction. Never serialize material to evidence/logs."""
import base64
import hashlib
import hmac
import re
import secrets

ROLES = ('hp_v3_app', 'hp_v3_identity_preauth_writer', 'hp_v3_identity_preauth_reader')


def scram_verifier(password, salt):
    if not isinstance(password, str) or not re.fullmatch(r'[a-f0-9]{64}', password) or not isinstance(salt, bytes) or len(salt) != 16:
        raise ValueError('CREDENTIAL_INPUT_INVALID')
    salted = hashlib.pbkdf2_hmac('sha256', password.encode('ascii'), salt, 4096)
    stored = hashlib.sha256(hmac.digest(salted, b'Client Key', 'sha256')).digest()
    server = hmac.digest(salted, b'Server Key', 'sha256')
    b64 = lambda value: base64.b64encode(value).decode('ascii')
    return 'SCRAM-SHA-256$4096:' + b64(salt) + '$' + b64(stored) + ':' + b64(server)


def new_material():
    result = {}
    for role in ROLES:
        password = secrets.token_hex(32)
        result[role] = {'password': password, 'verifier': scram_verifier(password, secrets.token_bytes(16))}
    return result
