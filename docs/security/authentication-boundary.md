# Authentication Boundary

## Current State

The server uses a provider abstraction in `src/auth.js`.

- `DevelopmentMockProvider`: local closed PoC only.
- `TestProvider`: signed JWT fixtures for tests.
- `OidcProvider`: provider boundary for production OIDC/JWT verification.
- `InternalServiceProvider`: internal audit and gateway service calls.

## Production Rule

`NODE_ENV=production` with `AUTH_MODE=DEVELOPMENT_MOCK` fails closed during startup.

## Principal Contract

Every authenticated request is normalized to a principal containing:

- `subject`
- `userId`
- `role` and `roles`
- `scopes`
- `hospitalId`
- `patientId`
- `doctorId`
- `authMethod`

APIs do not trust `patientId`, `doctorId`, or `hospitalId` from request bodies unless they match the authenticated principal.

## Not Verified

- Real hospital SSO
- Production JWKS rotation
- mTLS between services
