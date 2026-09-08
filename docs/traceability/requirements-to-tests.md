# 요구사항-시험 추적성 매트릭스

상태: 2026-09-07 현재 작업트리 기준. 기존 FR 개별 원문은 없어 기능군으로 추적합니다.

| 요구사항 범위 | 현재 구현/시험 | 판정 | 남은 검증 |
|---|---|---|---|
| FR-001~005 동의 | `test/hipass-service.test.js` 동의·철회 시험 | PASS (로컬) | 최신 Docker E2E |
| FR-006~009 영상 목록 | QIDO Study/Series/Instance 시험 | PASS (로컬) | 실제 PACS |
| FR-010~020 인증·정책 | RBAC+ABAC 음성시험 | PASS (로컬) | 실제 IdP/MFA |
| FR-021~025 단기 토큰 | TTL·issuer·audience·scope·철회 시험 | PASS (로컬) | 운영 키 관리 |
| FR-026~031 Gateway | Orthanc client·mTLS fixture | PARTIAL | Compose 네트워크·실제 Edge E2E |
| FR-032~036 Viewer | 정적 Viewer·순차 조회 코드 | PARTIAL | 브라우저 canvas·token header E2E |
| FR-037~041 감사·탐지 | Hash Chain·rule detector 시험 | PASS (로컬) | 내구성 큐·WORM/SIEM |
| FR-042~046 연구 가명화 | Privacy Filter 합성 시험 | PARTIAL | 실제 모델·DICOM 재파싱·defacing |
| v3 Device/Package/Handoff | OpenAPI·DDL·Schema만 존재 | NOT IMPLEMENTED | 승인 후 수직 슬라이스 |

실행하지 않은 Docker·PostgreSQL/RLS·모바일·외부 연동은 PASS로 해석하지 않습니다.
