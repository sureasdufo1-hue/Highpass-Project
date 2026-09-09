# 요구사항-시험 추적성 매트릭스

상태: 2026-09-07 현재 작업트리 기준. 기존 FR 개별 원문은 없어 기능군으로 추적합니다.

| 요구사항 범위 | 현재 구현/시험 | 판정 | 남은 검증 |
|---|---|---|---|
| FR-001~005 동의 | 단위시험과 HTTPS 동의·철회 E2E | PASS (로컬 Compose) | 실제 IdP/병원 환경 |
| FR-006~009 영상 목록 | QIDO Study/Series/Instance 시험 | PASS (로컬) | 실제 PACS |
| FR-010~020 인증·정책 | RBAC+ABAC 음성시험 | PASS (로컬) | 실제 IdP/MFA |
| FR-021~025 단기 토큰 | TTL·issuer·audience·scope·철회 시험 | PASS (로컬) | 운영 키 관리 |
| FR-026~031 Gateway | Orthanc client·mTLS·네트워크 경계·QIDO/WADO E2E | PASS (로컬 Compose) | 실제 PACS/병원망 |
| FR-032~036 Viewer | OHIF 계약·브라우저 영상 표시·Authorization header·URL token 비노출 | PASS (로컬 브라우저) | 운영 브라우저/실제 영상 |
| FR-037~041 감사·탐지 | Hash Chain·rule detector 시험 | PASS (로컬) | 내구성 큐·WORM/SIEM |
| FR-042~046 연구 가명화 | Privacy Filter 합성 시험 | PARTIAL | 실제 모델·DICOM 재파싱·defacing |
| v3 Device/Package/Handoff | OpenAPI·DDL·Schema만 존재 | NOT IMPLEMENTED | 승인 후 수직 슬라이스 |

Docker Compose와 PF-0 PostgreSQL/RLS는 2026-09-09 로컬에서 PASS했다. 모바일·실제 모델·외부 연동은 실행하지 않았으며 PASS로 해석하지 않는다.
