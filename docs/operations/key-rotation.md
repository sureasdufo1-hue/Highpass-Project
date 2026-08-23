# Signing Key Rotation

The DICOM token key lifecycle uses:

```text
ACTIVE -> VERIFY_ONLY -> RETIRED
```

## Procedure

1. Add Key B as ACTIVE.
2. Move Key A to VERIFY_ONLY for the maximum token TTL.
3. Continue verifying unexpired Key A tokens.
4. Issue all new tokens with Key B.
5. Retire Key A after the overlap window.
6. Confirm unknown or retired `kid` is denied.

## Evidence

Unit tests currently verify:

```text
DICOM token key rotation keeps verify-only keys and rejects retired keys:
PASS

signed DICOM access token includes kid and rejects unknown key id:
PASS

external HTTP key provider fails closed when runtime provider is unavailable:
PASS
```

KMS/HSM integration is `NOT VERIFIED` in the MVP. Development fallback must remain disabled in production-like settings.
