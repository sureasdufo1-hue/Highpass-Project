# Highpass Mobile-Core P0 진행 현황

기준일: 2026-09-12  
기준선: `4365f2c07d7ab9d69fc4b98db6f5e968b6a90464`

## 완료된 도메인 슬라이스

| WBS | 범위 | 상태 | 증적 |
|---|---|---|---|
| WBS-05 | 모바일 기기 등록·키 등록·활성화·분실·철회·위험도 | PASS (도메인 단위) | `test/mobile-device-registry.test.js` 7/7 |
| WBS-06 | 암호화 패키지 Builder·manifest·chunk hash | PASS (도메인 단위) | `test/mobile-package-crypto.test.js` |
| WBS-07 | AES-256-GCM nonce/tag/AAD 및 무결성 검증 | PASS (개발용 crypto adapter) | `test/mobile-package-crypto.test.js` |
| WBS-08 | 암호문 전용 Mobile Vault 저장·만료·철회·삭제 | PASS (인메모리 도메인 단위) | `test/mobile-vault.test.js` 4/4 |
| WBS-09 | Handoff 상태 전이·일회성 Ticket CAS·opaque QR | PASS (도메인 단위) | `test/mobile-handoff.test.js` 4/4 |
| WBS-10 | B Edge chunk 수신·재조립·hash/tag 검증·receipt | PASS (도메인 단위) | `test/mobile-receiver.test.js` 4/4 |
| WBS-11 step 1~2 | Key Release Authorization 서비스·release context 검증 | PASS (정책 도메인 단위) | `test/mobile-key-release.test.js` 6/6 |
| WBS-11 step 3 | Provider-neutral KMS envelope `rewrap` 계약·합성 adapter | PASS (계약/테스트 단위) | `test/mobile-kms-adapter.test.js` 5/5 |
| WBS-11 step 4~6 | 정책→adapter orchestration·key envelope 상태·감사·음성 경로 | PASS (로컬 도메인 단위) | `test/mobile-key-release-flow.test.js` 5/5 |
| WBS-11 step 7 | 외부 KMS 전환 경계·검증 체크리스트 | PASS (문서화) | `docs/integration/kms-integration.md` |
| WBS-12 | B Edge VERIFIED 패키지 transient decrypt·DEK/plaintext zeroize | PASS (로컬 도메인 단위) | `test/mobile-transient-decrypt.test.js` 5/5 |

## 구현 범위

- `src/mobile-device-registry.js`는 서버 측 기기 상태 전이와 public JWK 검증을 fail-closed로 처리한다.
- `src/mobile-package-crypto.js`는 합성 payload를 AES-256-GCM으로 chunk별 암호화하고, manifest·chunk·package hash를 검증한다.
- `src/mobile-vault.js`는 암호문 chunk만 저장하고 TTL 만료·철회·crypto erase 삭제 receipt를 처리한다. 백업·임의 공유는 fail-closed로 차단한다.
- `src/mobile-handoff.js`는 생성→발급→스캔→환자승인→권한승인→소비 상태를 강제하고, nonce hash만 저장하며 QR 재사용·병원 불일치·만료·철회를 거부한다.
- `src/mobile-receiver.js`는 암호문 chunk를 순서와 무관하게 수신하고 중복을 idempotent 처리하며, 누락·변조·재조립 hash 불일치를 거부한다. DEK가 제공된 경우에만 AES-GCM tag와 manifest를 검증해 VERIFIED receipt를 만든다.
- `src/mobile-key-release.js`는 환자 승인·B MFA·동의·기관·의료진·Ticket·기기·패키지 VERIFIED·manifest 무결성·scope·TTL을 모두 재검증한다. `validateKeyReleaseContext`가 교차 객체 검증 결과를 고정하고, 조건을 만족할 때만 raw DEK 없는 1회성 B Gateway rewrap 권한 artifact를 발급한다. KMS 호출과 envelope 상태 변경은 다음 WBS 단계로 분리한다.
- `src/mobile-kms-adapter.js`는 비동기 provider-neutral `rewrapEnvelope` 계약과 로컬 합성 adapter를 제공한다. 합성 adapter는 envelope 참조·keyRef·버전만 반환하고 raw DEK·개인키를 거부한다. 외부 KMS vendor 구현은 제공된 자원과 권한 검증 후 별도 추가한다.
- `src/mobile-key-release-flow.js`와 `src/mobile-key-envelope-store.js`는 정책 승인→rewrap→B Gateway envelope 메타데이터 저장 흐름과 ACTIVE/DISABLED/DESTROYED 상태·감사를 로컬에서 검증한다. 실제 PostgreSQL `key_envelopes` runtime wiring은 아직 외부 DB/API 작업으로 남아 있다.
- `src/mobile-transient-decrypt.js`는 B Edge에서 `VERIFIED`·미만료 패키지와 허용된 Key Release authorization만 복호화하고, plaintext 소비 콜백 이후 plaintext chunk와 transient DEK를 성공·실패 모든 경로에서 zeroize한다. 결과·감사에는 키와 원문을 남기지 않는다.
- 패키지 외부 envelope에는 암호화된 manifest만 포함하며 DICOM UID, 환자 식별자, 토큰, 개인키를 평문으로 넣지 않는다.
- 만료·변조·인증 태그 오류·범위 오류는 typed error로 거부한다.

## 아직 구현하지 않은 범위

- PostgreSQL `mobile_devices`, `package_manifests`, `package_chunks` 테이블과의 runtime wiring
- 실제 KMS/HSM/Vault envelope wrap/unwrap
- PostgreSQL `key_envelopes` runtime wiring·실제 KMS/HSM envelope wrap/unwrap·실제 B Edge 네트워크/스토리지 연결
- API/OpenAPI route 연결 및 실제 모바일 클라이언트
- 실제 IdP·PACS·병원망·외부 Staging 연동

위 항목은 Issue #11의 후속 P0 작업으로 유지한다. 현재 결과는 합성 로컬 MVP 기술 검증이며 상용 운영 또는 PIPA·ISMS-P·병원 승인 증적이 아니다.

## 관련 요구사항

- FR-021~FR-025: 단기·범위 제한 토큰과 재사용 방지 원칙(패키지 범위 검증 기반)
- FR-037~FR-041: 행위 추적을 위한 도메인 audit event hook
- NFR-SEC-KEY / PKG-INT-001 / CRYPTO-001: nonce, tag, hash, tamper deny

