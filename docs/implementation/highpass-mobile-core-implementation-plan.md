# Highpass Mobile-Core 구현계획서

> 계획만 작성한다. 애플리케이션 구현, migration 적용, 실제 KMS·IdP·PACS 연결은 수행하지 않았다.

## 1. 구현 원칙과 기준선

P0 dependency order는 Contract→DB→Consent/Policy→Device→Package/Crypto→Mobile Vault→Handoff→B Receive/Verify→Key Release→View/PACS→Audit/Delete→통합시험이다. 기존 API와 테스트를 보존한다. 실제 PHI·운영 credential·private key·token을 commit하지 않는다.

## 2. WBS

| WBS | 작업·세부내용 | 산출물/변경 후보 | 선행 | P | 완료조건·시험 | 위험·롤백 |
|---|---|---|---|---|---|---|
| WBS-01 | ADR: envelope B, state, TTL, direct path 확정 | ADR/docs | 없음 | P0 | 승인 baseline | 미결정 시 구현중지; 문서 revert |
| WBS-02 | OpenAPI/JSON/CDDL lint·example·scope 확정 | docs/api, schemas | 01 | P0 | Contract Gate, CT-001~006 | breaking contract; version 유지 |
| WBS-03 | ERD/DDL/RLS/idempotency/outbox | migration/store modules | 02 | P0 | DB Gate, DB-001~007; data loss 0 | transaction rollback, migration 미적용 |
| WBS-04 | consent v3, policy, typed token/hash migration | server/service/store/auth/test | 03 | P0 | 기존 test+SEC-CONSENT/TOKEN | dual-read rollback |
| WBS-05 | device registration/key/revoke/lost/risk | device service/table/mobile API | 04 | P0 | SEC-DEVICE-001~004 | attestation false positive; feature flag |
| WBS-06 | A Package Builder/manifest/chunk | A Edge/package modules | 02,04 | P0 | PKG-001~006, no out-of-scope object | temp cleanup |
| WBS-07 | AES-GCM/KMS envelope B | crypto/KMS adapter | 01,06 | P0 | unique nonce, tag, key non-log; SEC-KEY | KMS adapter disable/destroy test key |
| WBS-08 | one mobile platform Vault/download/delete | mobile package/storage | 05~07 | P0 | backup/share block, encrypted rest, deletion | app data reset/test device only |
| WBS-09 | Handoff Broker/Ticket CAS/QR | Control/mobile/B UI | 04,05,08 | P0 | first use allow, replay deny, no QR PII/key | revoke all test tickets |
| WBS-10 | B resumable receiver/verify/receipt | B Edge/upload modules | 07,09 | P0 | chunk/reassembly/hash/tag/receipt | quarantine/delete ciphertext |
| WBS-11 | Key Release Authorization/rewrap | Policy/KMS/B Edge | 07,10 | P0 | patient+B dual condition; denial suite | disable envelope version |
| WBS-12 | B decrypt transient handling | B Edge/KMS | 11 | P0 | decrypt only VERIFIED, memory cleanup | process isolation/restart |
| WBS-13 | OHIF scoped Remote Viewing | Viewer/B DICOM adapter | 04,12 | P0 | QIDO/WADO scope, direct PACS deny | revert Viewer config |
| WBS-14 | QIDO/WADO Frame and progressive retrieval | Gateway/DICOM tests | 13 | P0 | Study~Frame negative tests | feature flag |
| WBS-15 | STOW/C-STORE optional import | B adapter/PACS import | 12,14 | P0 decision/P1 | explicit IMPORT, idempotent receipt | disable import; no auto-delete PACS |
| WBS-16 | audit/outbox/expiry/revoke/delete/cache | Audit/workers/ops | 03~15 | P0 | completeness, hash chain, TTL receipts | stop worker, preserve ciphertext isolation |
| WBS-17 | bounded retry/recovery/monitoring | common HTTP/metrics/runbook | 09~16 | P0 | no infinite wait; failure taxonomy | config rollback |
| WBS-18 | unit/contract/integration/security/failure E2E | tests/evidence | all | P0 | all required PASS or explicit BLOCKED | no false PASS |
| WBS-P1 | offline direct, mobile Viewer, second OS, PQC, FHIR/IHE, multi-tenant scale, advanced attestation | separate backlog | P0 | P1 | separate acceptance | no P0 coupling |

각 WBS는 목적/변경파일/API·DB·Schema·보안·시험 영향의 PR checklist를 사용한다. 스키마 변경은 expand→backfill→dual-read→verify→contract 순이며 rollback 가능 시점과 backup/restore rehearsal을 기록한다.

## 3. Acceptance Gates

| Gate | 필수 검사 | 실패 처리 |
|---|---|---|
| Contract | OpenAPI 3.1 parse, unique operationId, `$ref`, problem+json, scope, examples | FAIL; 구현 merge 금지 |
| Database | ERD=DDL, syntax dry-run, FK/unique/check/partial index, RLS tenant, existing data count/hash | FAIL; migration 미적용/rollback |
| Package | 4 JSON Schema, 4 CDDL, semantic round-trip, canonical hash, chunk/object hash, GCM tag, QR PII/key scan | FAIL; package release 금지 |
| Security | OIDC/MFA, RBAC+ABAC, Study~Frame, aud/scope/replay/revoke, TLS/mTLS, dual key release, device revoke, audit, fail closed | FAIL; affected flow disabled |
| Integration | A PACS→A Edge→Mobile→B Edge→Viewer/PACS, QIDO/WADO/STOW/C-STORE, retry, deletion | 미실행은 NOT VERIFIED/BLOCKED |

## 4. 테스트·증적계획

| Test ID | 요구사항 | API/DB/Schema/시퀀스 | 기대결과 | 증적 |
|---|---|---|---|---|
| CT-OAS-001 | API 계약 | OpenAPI/all operations | parse, unique operationId, refs PASS | parser report |
| DB-MIG-001 | 데이터 무결성 | migration/ERD | dry-run, constraints/RLS, 기존 data loss 0 | SQL log |
| SCH-JSON-001 | package contract | 4 JSON Schema | valid accept/invalid reject | test report |
| SCH-CBOR-001 | semantic parity | 4 CDDL | deterministic round-trip same meaning | vectors/hash |
| CRYPTO-001 | FR-PACKAGE/KEY | package/key schema | encrypt/decrypt, nonce uniqueness, bad tag DENY | vectors, no key logs |
| PKG-INT-001 | FR-PACKAGE | chunks/manifest | reassembly/count/hash PASS; tamper DENY | receipt |
| SEC-QR-001 | FR-QR | Handoff sequence | QR contains no PHI/UID/key/JWT/path | scanner output |
| SEC-QR-002 | FR-HANDOFF | Ticket DB/API | first use only; replay blocked | audit trace |
| SEC-TOKEN-001 | FR-POLICY | token service | wrong aud/scope/revoked DENY | responses |
| SEC-CONSENT-001 | FR-CONSENT | consent/policy | revoke immediately blocks all new action | audit trace |
| SEC-DEVICE-001 | FR-MOBILE | device/key release | revoked/lost/compromised DENY | trace |
| SEC-KEY-001 | FR-KEY | Key sequence | missing patient/B condition DENY; raw DEK absent | KMS audit |
| E2E-HOF-001 | FR-HANDOFF | all mobile path | success through receipt/delete | correlation trace |
| E2E-HOF-002 | FR-ERROR | upload | interruption resumes exact chunks | checkpoint evidence |
| SEC-MTLS-001 | NFR security | B Gateway | valid allow; none/untrusted/expired deny | TLS logs |
| DCM-QIDO-001 | FR-DICOM | QIDO endpoints | only allowed Study/Series/Instance | response |
| DCM-WADO-001 | FR-DICOM | WADO/Frame | allowed view; frame mismatch deny | response |
| PACS-001 | FR-PACS | STOW/C-STORE | explicit import, duplicate idempotent | receipt |
| NET-ISO-001 | PACS isolation | network boundary | browser/public direct PACS deny | network evidence |
| AUD-001 | FR-AUDIT | audit/outbox | required event coverage+hash chain | manifest |
| LIFE-001 | FR-STORAGE | cache/mobile/delete | Relay TTL, package expiry/delete receipt | time evidence |
| RELAY-001 | data plane | Relay | ciphertext-only, outage no insecure bypass | inspection |
| BG-001 | Break Glass | policy/audit | constrained grant, auto-expiry, enhanced audit | audit trace |

기존 시험은 삭제하지 않는다. “기존 52개”는 실제 집계 후 baseline으로 고정하며 확인 전에는 숫자를 단정하지 않는다.

## 5. 단계별 Gate와 릴리스

- Phase A Contract/DB: CT-OAS, DB-MIG, Schema Gate.
- Phase B Control: 기존 regression+consent/token/device negative.
- Phase C Package/Mobile: crypto/package/Vault/delete.
- Phase D Handoff/B Edge: QR/replay/upload/verify/key release/mTLS.
- Phase E Imaging: QIDO/WADO/Viewer, 승인된 경우 PACS import.
- Phase F Full MVP: 정상·음성·장애·TTL·감사 evidence와 deterministic cleanup.

각 단계는 feature flag, test tenant, synthetic DICOM, test keys만 사용한다. 외부 staging/실제 KMS·OIDC·PACS가 없으면 `ENVIRONMENT BLOCKED` 또는 `NOT VERIFIED`로 기록한다.

## 6. 운영·보안 제약

- PHI·실제 PACS·운영 credential 금지; private key/token/API key commit 금지.
- migration 자동 적용 금지; 승인·backup·dry-run·rollback 준비 후 수동 promotion.
- 인증서 만료/chain 오류는 연결 거부. TLS/mTLS 완화와 직접 PACS 우회 금지.
- audit 누락 시 중요 허용행위 rollback; buffer 정책은 승인 필요.
- 분실은 device/token/key release 차단과 온라인 삭제, 오프라인 crypto erase를 적용한다.
- PoC의 mock IdP/dev CA/synthetic PACS는 운영 준비 증거가 아니다.

## 7. 미결정·미검증

TTL/보존기간, package/chunk 크기, JSON/CBOR container, HPKE/KMS 제품, mobile OS/attestation, direct network, PACS_IMPORT P0 여부, Break Glass, audit retention은 미결정이다. OpenAPI parser, SQL dry-run, CDDL validator, CBOR round-trip, 실제 KMS/IdP/PACS, mobile build/E2E, external staging은 아직 미검증이다.

## 8. 다음 단계

> OpenAPI·DDL·JSON/CBOR Schema를 기준으로 Control Plane·Gateway·모바일 패키지 모듈을 단계별 구현하고, 계약·보안·DICOM E2E 테스트를 수행한다.
