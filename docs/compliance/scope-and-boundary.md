# Scope and Boundary

검토 기준일: 2026-08-26

## 시스템 경계

하이패스 Platform MVP는 환자 동의 기반 의료영상 공유 흐름을 로컬 Docker Compose에서 재현한다. 송신 병원은 가상 병원 A, 수신 병원은 가상 병원 B/C로 한정한다.

| 구성요소 | 역할 | 현재 증적 | 판정 |
|---|---|---|---|
| Control Plane API | 동의, 정책, 토큰, 감사로그 | `src/`, `npm test`, HTTPS E2E | PASS |
| PostgreSQL | 메타데이터 저장 | Docker health, `/api/health` | PASS |
| Gateway | DICOMweb 범위 검증 | `src/dicomGateway.js`, E2E | PASS |
| Orthanc mTLS proxy | 병원 PACS 앞단 mTLS 경계 | `scripts/orthanc-mtls-proxy.js`, mTLS tests | PASS |
| Orthanc | 샘플 DICOM 저장 | Docker health, Gateway 조회 | PASS |
| Viewer | 승인 토큰 기반 조회 UI | HTTPS E2E, browser auth trace | PARTIAL |
| Cloud/KMS/OIDC/SIEM/DR | 운영 외부 자원 | 문서와 hook만 존재 | BLOCKED |

## 개인정보 흐름

| 흐름 | 현재 구현 | 확인 상태 |
|---|---|---|
| 수집 | 가상 환자·의사·병원 seed | PASS |
| 생성 | Consent, TokenLog, AuditLog | PASS |
| 조회 | RBAC/ABAC, Gateway token 검증 | PASS |
| 병원 간 전송 | Orthanc 샘플 DICOMweb 스트리밍 | PASS |
| 임시 저장 | Control Plane 원본 DICOM 지속 저장 없음 | PASS |
| 장기 저장 | 운영 보유기간 미확정 | PARTIAL |
| 다운로드 | VIEW_ONLY 서버측 차단 | PASS |
| 백업 | 로컬 백업/복구 증적 일부 | PARTIAL |
| 파기 | dry-run purge plan, 실제 삭제 미구현 | PARTIAL |
| 위탁/국외이전 | 실제 계약/리전 미정 | BLOCKED |

## 제외 범위

실제 병원망, 실제 PACS, 실제 환자정보, 상용 클라우드 계정, 운영 인증기관 인증서는 이번 범위에서 제외한다. 제외 사유는 승인된 MVP/PoC 범위이며, 운영 전 계약·법무·병원 보안심사에서 재검토해야 한다.
