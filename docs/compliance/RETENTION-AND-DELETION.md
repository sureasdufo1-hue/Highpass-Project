# Retention and Deletion Policy

기준일: 2026-07-11

## 원칙

- 법정 보존기간은 임의 추정하지 않는다.
- 법적 기간이 확정되지 않은 항목은 `LEGAL RETENTION PERIOD NOT DETERMINED`로 표시한다.
- 기본 purge는 `DRY_RUN`이며 실제 삭제는 운영 승인 후 별도 구현한다.
- Control Plane은 원본 DICOM을 지속 저장하지 않는다.

## 정책 테이블

| 데이터 | 보유 목적 | 위치 | 정책 | 파기 방식 | 상태 |
|---|---|---|---|---|---|
| Consent | 동의 증적 | `consents` | LEGAL RETENTION PERIOD NOT DETERMINED | soft-delete candidate | PARTIAL |
| REVOKED Consent | 철회 증적 | `consents` | LEGAL RETENTION PERIOD NOT DETERMINED | 감사 증적 보존 후 후보 | PARTIAL |
| ImagingStudy metadata | 범위 검증 | `imaging_studies` | LEGAL RETENTION PERIOD NOT DETERMINED | metadata purge candidate | PARTIAL |
| AuditLog | 보안·분쟁 증적 | `audit_logs` | LEGAL RETENTION PERIOD NOT DETERMINED | 일반 purge 금지 | PARTIAL |
| AccessTokenLog | 토큰 추적 | `dicom_access_token_logs` | configurable | dry-run candidate | IMPLEMENTED |
| Temporary Cache | 임시 처리 | 없음 | configurable | delete transient cache | NOT VERIFIED |
| Temporary DICOM | 임시 DICOM | 없음 | configurable | delete temporary object | NOT VERIFIED |
| Research derivation | 연구 반출 증적 | `research_export_requests` | LEGAL RETENTION PERIOD NOT DETERMINED | 승인 lifecycle 후 후보 | PARTIAL |
| Pseudonym Mapping | 재연결 보호 | `pseudonym_mappings` | LEGAL RETENTION PERIOD NOT DETERMINED | 별도 보호 삭제 절차 | PARTIAL |

## 구현 상태

- `src/retention.js`에 정책 구조와 dry-run purge plan을 구현했다.
- `GET /api/retention/policies`는 `SECURITY_ADMIN` 또는 `PLATFORM_ADMIN`만 접근한다.
- `POST /api/retention/purge-plan`은 dry-run 계획만 반환한다.
- 실제 삭제는 수행하지 않는다.

## Backup

현재 로컬 MVP에는 백업 시스템이 구현되어 있지 않다.

상태: **NOT VERIFIED**
