# MediQ Patient Experience Feature Traceability

**Ticket:** `MEDIQ-DOC-002`  
**Version:** v1.2  
**Status:** Approved Documentation Traceability — Implementation Tests Not Run

## 1. 목적

이 표는 기능 1–9의 Scope, Requirement, Security, Screen, Acceptance, 구현 Ticket과 기존 MediQ 기준선을 연결한다. 상세 문장이 충돌하면 각 Feature Spec과 상위 승인 기준을 우선한다.

## 2. 기능별 추적성

| # | 기능 | 분류 | Requirement | Security | Screen | Acceptance | Primary Ticket | 핵심 선행조건 |
|---:|---|---|---|---|---|---|---|---|
| 1 | 행동센터 | P1 | `REQ-PXE-AC-001~008` | `SEC-PXE-AC-001~005` | `MOB-PXE-AC-001~004` | `TC-PXE-AC-001~006` | `MEDIQ-PXE-AC-001` | 공통 Projection, 2·3·6·7 상태 |
| 2 | 접근이력·영수증 | P1 | `REQ-PXE-AR-001~008` | `SEC-PXE-AR-001~005` | `MOB-PXE-AR-001~004` | `TC-PXE-AR-001~006` | `MEDIQ-PXE-AR-001` | Audit 원장, Consent Snapshot |
| 3 | 개인정보 최소 알림 | P1 | `REQ-PXE-NT-001~008` | `SEC-PXE-NT-001~006` | `MOB-PXE-NT-001~004` | `TC-PXE-NT-001~006` | `MEDIQ-PXE-NT-001` | Domain Event, Installation 정책 |
| 4 | 병원 방문 모드 | P1 | `REQ-PXE-VM-001~008` | `SEC-PXE-VM-001~006` | `MOB-PXE-VM-001~005` | `TC-PXE-VM-001~007` | `MEDIQ-PXE-VM-001` | QR, Destination, Preflight, P0 E2E |
| 5 | 쉬운 영상 카드 | P1 | `REQ-PXE-IC-001~008` | `SEC-PXE-IC-001~005` | `MOB-PXE-IC-001~003` | `TC-PXE-IC-001~006` | `MEDIQ-PXE-IC-001` | Study Projection, Mapping 정책 |
| 6 | 저장공간·만료 | P1 | `REQ-PXE-SE-001~008` | `SEC-PXE-SE-001~006` | `MOB-PXE-SE-001~004` | `TC-PXE-SE-001~007` | `MEDIQ-PXE-SE-001` | Vault, Capsule, Lease, Keystore |
| 7 | 오류 복구 | P1 | `REQ-PXE-ER-001~008` | `SEC-PXE-ER-001~005` | `MOB-PXE-ER-001~004` | `TC-PXE-ER-001~007` | `MEDIQ-PXE-ER-001` | Error Envelope, idempotency |
| 8 | 판독문·의뢰서 | POST-MVP | `REQ-PXE-RR-001~008` | `SEC-PXE-RR-001~005` | `MOB-PXE-RR-001~005` | `TC-PXE-RR-001~007` | `MEDIQ-PXE-RR-001` | Scope Decision, 문서 Profile ADR |
| 9 | 보호자·가족 위임 | POST-MVP | `REQ-PXE-GD-001~009` | `SEC-PXE-GD-001~006` | `MOB-PXE-GD-001~006` | `TC-PXE-GD-001~007` | `MEDIQ-PXE-GD-001` | 법적 Gate, Identity/Authority ADR |

총계: 기능 요구사항 73개, 보안 요구사항 49개, 논리 화면 39개, Acceptance 시나리오 59개. 논리 화면은 기존 Mobile Screen 77개에 아직 병합되지 않았다.

## 2.1 확장 기능 추적성

| 기능 | 분류 | Requirement | Security | Screen | Acceptance | Ticket | 구현 상태 |
|---|---|---|---|---|---|---|---|
| 편의 기능 확장 | P1 / 일부 POST | `REQ-PXE-CX-001~013` | `SEC-PXE-CX-001~008` | `MOB-PXE-CX-001~009` | `TC-PXE-CX-001~009` | `MEDIQ-AIQ-001` | HTML 일부 / 제품 미구현 |
| 외부 LLM 질문자료 | P1 Synthetic / 실제자료 Production | `REQ-AIQ-001~008` | `SEC-AIQ-001~007` | 기존 합성 건강정보 화면의 비규범 Prototype | `TC-AIQ-001~008` | `MEDIQ-AIQ-001` | HTML Prototype / 연동 없음 |
| 합성 환자 설명 RAG | P1 Synthetic | `REQ-RAG-001~020` | `SEC-RAG-001~015` | `MOB-RAG-001~006` 논리 화면 | `TC-RAG-001~020` | `MEDIQ-RAG-001` | 문서·Fixture / Runtime 없음 |

`ListMyTimeline`, `SearchMyRecords`, `GetDataAvailability`, `CreateCorrectionCase`, `CreateVisitPacket`은 API GAP이며 `OPENAPI.yaml`에 등록되지 않았다. 외부 LLM용 API는 현재 만들지 않는다.

RAG API도 현재 만들지 않는다. Capstone은 Local Fixture·in-memory Session을 우선하며 Backend·Model·Knowledge Release API가 필요해지면 별도 Contract Ticket에서 승인한다.

## 3. 상위 기준선 연결

| 기준 문서 | 적용 |
|---|---|
| `CAPSTONE-MVP-BOUNDARY.md` | 1–7 P1, 8–9 POST-MVP; P0 완료조건 불변 |
| `PRODUCT-BASELINE.md` | 환자 경험 확장 Capabilities와 금지 주장 |
| `REQUIREMENTS.md` | ID Range와 구현 전 Contract/Data Gate |
| `SECURITY-REQUIREMENTS.md` | Projection 최소화, 재인가, 알림·오류·위임 통제 |
| `DOMAIN-MODEL.md` / `DATA-MODEL.md` / `ERD.md` | 현재 논리 후보만 정의; 구현 Migration 전 별도 개정 필요 |
| `OPENAPI.yaml` | 새 API는 모두 GAP; 승인 Contract로 간주하지 않음 |
| `MOBILE-API-CONTRACT.md` | Lease/Vault 관련 후보와 정합성 검토 필요 |
| `MOBILE-SCREEN-DESIGN-SPEC.md` | 논리 화면 ID만 정의; 전역 화면 수 미변경 |
| `THREAT-MODEL.md` | 기능군 공통 위협 및 기능별 Threat Table |
| `ACCEPTANCE-TESTS.md` | 상세 TC는 Feature Spec에 있고 현재 전부 NOT RUN |
| `IMPLEMENTATION-PLAN.md` | Wave 0–6과 제안 Ticket |
| `SYNTHETIC-HEALTH-DATA-PREVIEW.md` | 건강검진·혈액·항체검사 Optional P1 Demo; 기능 1–9 권한과 분리 |

## 4. 공통 결정 추적

| 결정 | 적용 기능 | 검증 포인트 |
|---|---|---|
| UI/Push/QR/Deep Link는 권한이 아님 | 1, 3, 4, 9 | 서버 재인가 없는 CTA 거부 |
| 서버 확정 전 성공 미표시 | 1, 4, 7 | Result Unknown과 완료 분리 |
| 환자용 Projection 최소화 | 1, 2, 5 | 내부 ID·UID·Endpoint 미노출 |
| 원본 Metadata/문서 불변 | 2, 5, 8 | Version/Hash/Provenance 보존 |
| 파괴적 행위 명시 확인 | 6, 9 | 삭제·철회·고위험 위임 확인 |
| 의료 해석 금지 | 5, 8 | 진단·정상/이상·요약 미생성 |
| POST-MVP Gate | 8, 9 | P1 Backlog에 자동 편입 금지 |

## 5. API·Data Decision Log

| GAP | 영향 기능 | 구현 전 필수 결정 |
|---|---|---|
| State/Action Projection | 1, 4 | Consistency, TTL, stateVersion |
| Patient Audit Projection/Receipt | 2 | 원장 Projection, 서명, 보존 |
| Notification/Installation | 3 | 공급자, Token Lifecycle, Event Policy |
| Imaging Card Projection | 5 | Metadata Allowlist, Mapping Version |
| Lease/Delete Evidence | 6 | 시간 Anchor, Crypto-shred Journal |
| Error Envelope | 1–9 | Stable Code, idempotency, Result Unknown |
| Clinical Document Domain | 8 | Profile, Malware Scan, Provenance |
| Delegated Authorization | 9 | Identity, 법적 권한, Scope, Revocation |

위 GAP는 이 문서만으로 API·DB를 승인하지 않는다. 구현 Ticket에서 OpenAPI와 Domain/Data/ERD를 함께 개정한다.

## 6. 시험 상태

문서 정적 검증 외 애플리케이션 Unit, Contract, Integration, Security, DICOMweb, Android UI, E2E 시험은 실행하지 않았다. 상세 TC는 구현 Ticket의 자동·수동 시험으로 변환하고 실제 명령·결과를 `TEST-EVIDENCE.md`에 기록해야 한다.
