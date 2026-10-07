# Highpass v3 Architecture Decision Log

상태: **PROPOSED DECISIONS / ARCHITECTURE REVIEW REQUIRED**
기준일: 2026-09-12

모든 결정은 설계 기준이며 법률·운영 승인이나 구현 완료를 뜻하지 않는다.

| ADR | Decision | Alternatives rejected | Security / implementation / migration impact |
|---|---|---|---|
| ADR-001 | Highpass는 Patient-Controlled Medical Imaging Mobility SaaS다. | Cloud PACS, Viewer-only, Mobile-only | 장기 중앙보관 확대를 기본값으로 금지; 기존 MVP는 v3 하위 경로로 보존 |
| ADR-002 | PatientRef와 기관별 PatientMapping을 분리한다. | 한 병원 ID를 global ID로 사용, 이름 기반 자동 merge | 오매칭을 줄이고 VERIFIED 전 PACS import를 차단; 기존 refs backfill 필요 |
| ADR-003 | ExchangeSession을 업무 aggregate root로 둔다. | TransferRequest 또는 Ticket 중심 | 상태·시간·목적·경로를 단일 추적; legacy IDs는 child/reference로 유지 |
| ADR-004 | PATIENT_INITIATED와 PROVIDER_INITIATED를 구분한다. | 하나의 익명 request flow | 동의 주체·재인증·감사 차이를 보존; API discriminator 필요 |
| ADR-005 | Consent는 versioned evidence artifact다. | boolean, token 자체를 consent로 간주 | 철회/버전/증거 추적 강화; 상태 compatibility migration 필요 |
| ADR-006 | Consent, Authorization, TransferGrant를 분리한다. | 하나의 JWT로 세 의미 표현 | 최소권한·freshness 강화; policy decision 뒤 grant issuance 적용 |
| ADR-007 | ExchangeSession과 ImagingPackage를 분리한다. | session 안에 payload 저장 | workflow와 데이터 수명주기 분리; 복수 Study snapshot 지원 |
| ADR-008 | Source Hospital PACS가 Source of Record다. | Gateway/Cloud를 원본기관으로 정의 | 의료기록 책임 오인을 줄임; Connector는 proxy 역할만 수행 |
| ADR-009 | Cloud는 Medical Imaging Exchange Broker이며 payload는 임시 암호화 copy다. | 영구 Cloud PACS | 목적 제한·TTL·삭제 증적 필요; long-term vault는 Future |
| ADR-010 | TransferGrant는 recipient/resource/action/TTL 제한 실행 객체다. | 장기 URL, 범용 token | scope escalation/replay 완화; 기존 token을 representation으로 호환 |
| ADR-011 | VIEW/DOWNLOAD/PACS_IMPORT/MOBILE_EXPORT는 동등한 독립 권한이다. | Viewer 자동 기본 허용, VIEW가 download 포함 | UI도 grant scope에 따라 노출; 명시하지 않은 action은 DENY |
| ADR-012 | payload 전송 전에 Preflight gate를 둔다. | transfer 후 오류 발견 | wrong destination·unsupported syntax·quota 실패를 조기 차단 |
| ADR-013 | Provenance가 source/ingest/transfer/destination integrity를 연결한다. | audit log 또는 file hash만 사용 | bit-preserving과 transcoded 판정을 분리; 새로운 aggregate/API 필요 |
| ADR-014 | 모든 리소스는 tenant ownership과 hospital scope를 가진다. | endpoint별 임의 필터 | cross-tenant IDOR 방어; DB RLS는 defense-in-depth, 앱 검증을 대체하지 않음 |
| ADR-015 | PS3.18은 DICOMweb 계약, PS3.15는 보안 메커니즘 기준으로 분리한다. | TLS/인가를 PS3.18 준수로 주장 | 잘못된 conformance claim 방지; 별도 conformance statement 필요 |
| ADR-016 | IHE는 MVP 전체 구현이 아니라 compatibility-by-design roadmap이다. | 자체 cross-enterprise 표준 재발명, 허위 conformance | XDS-I.b/XCA-I/WIA actor/transaction 시험 전 준수 주장 금지 |
| ADR-017 | Mobile Vault는 제품 전체가 아닌 P1 patient-side secure edge다. | 모바일을 P0 핵심제품으로 고정 | 기존 WBS-05~12 보존, 제품 릴리스 우선순위 변경 |
| ADR-018 | Mobile payload는 Secure Medical Capsule로 저장한다. | 평문 DICOM 파일 저장 | encrypted manifest/payload, wrapped DEK, device binding 필요 |
| ADR-019 | QR은 Transfer Request Bootstrap만 담는다. | DICOM/PHI/key/token 운반 | opaque request+nonce+expiry+signature, atomic replay denial |
| ADR-020 | secure deletion은 access revoke→wrapped key destruction→ciphertext lifecycle delete→audit로 정의한다. | 파일 삭제만으로 완료 주장 | decrypt denial과 deletion receipt 필요; B PACS copy는 B 정책 책임 |
| ADR-021 | Capstone Technical MVP와 Productionization readiness를 분리한다. | 법률·실환자·실병원 미완료를 로컬 MVP blocker로 통합 | Synthetic P0 E2E를 우선하며 법률 적합성 주장은 금지; `CAPSTONE-MVP-BOUNDARY.md`를 Normative Scope로 적용 |

## Approval record

| Role | Reviewer | Status | Date |
|---|---|---|---|
| Product/PM | 미지정 | PENDING | — |
| Medical information | 미지정 | PENDING | — |
| Security/Privacy | 김범희의 2026-09-12 독립검토 기록은 이전 Phase 증적에 한정 | NEW BASELINE REVIEW REQUIRED | — |
| Legal/DPO | 미지정 | LEGAL REVIEW REQUIRED | — |
