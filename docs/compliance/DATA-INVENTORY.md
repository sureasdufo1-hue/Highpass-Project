# Personal Data Inventory

기준일: 2026-08-26

상세 개인정보 흐름과 법적 근거 후보는 `docs/compliance/data-flow-and-inventory.md` 및 `docs/compliance/lawful-basis-matrix.md`를 기준으로 한다.

## 데이터 분류

| 데이터 | 현재 위치 | 개인정보성 | 현재 상태 | 위험 |
|---|---|---:|---|---|
| 환자 식별자 | `patients.patient_id` | 높음 | 가상 ID 사용 | 실환자 전환 시 고위험 |
| 환자 이름 | `patients.name` | 높음 | 가상 이름 사용 | UI/API 노출 통제 필요 |
| 생년월일 | `patients.birth_date` | 높음 | 가상 값 | 최소 수집 검토 필요 |
| 연락처 | `patients.phone` | 높음 | 가상 값 | MVP에는 불필요 가능 |
| 의료영상 메타데이터 | `imaging_studies`, `imaging_series` | 중~높음 | 최소 메타데이터 | UID와 기관 정보 결합 위험 |
| 원본 DICOM | Orthanc | 매우 높음 | Control Plane 지속 저장 없음 | Orthanc 인증·망분리 필요 |
| 동의 정보 | `consents`, `consent_scopes` | 높음 | 목적/기간/범위 저장 | 동의 증적 문구 부족 |
| 접근토큰 로그 | `dicom_access_token_logs` | 높음 | 토큰 해시 저장 | 컬럼명 `token`은 오해 소지 |
| 감사로그 | `audit_logs` | 높음 | 표준 필드+해시체인 | 조회/생성 API 통제 미흡 |
| 가명 매핑 | `pseudonym_mappings` | 매우 높음 | 보호 참조값과 key provider marker 추가 | 실제 KMS·별도 DB 분리 미구현 |
| 연구 반출 | `research_export_requests` | 높음 | 승인 상태 구현 | 실제 심의·승인자 검증 필요 |

## 원본 DICOM 저장 여부

Control Plane DB에는 원본 DICOM 파일을 지속 저장하지 않는다. `imaging_studies.metadata_only`와 Orthanc 기반 Data Plane 구조는 AGENTS.md의 Control Plane/Data Plane 분리 원칙과 일치한다.

## 최소 수집 검토

MVP 기능상 환자 연락처(`phone`)와 상세 생년월일은 필수성이 낮다. 실서비스 전에는 다음 중 하나를 선택해야 한다.

- 완전 제거
- 별도 암호화 저장
- 병원 원장 시스템에만 보관하고 하이패스에는 대체 식별자만 저장

## 보관·파기 미정 항목

현재 `src/retention.js`와 `docs/compliance/RETENTION-AND-DELETION.md`에 dry-run 보관정책 구조를 추가했다. 다만 법정 보존기간은 확정하지 않았고, 다음 항목은 운영 법무 검토가 필요하다.

- 환자/의료진/병원 마스터
- 동의 및 철회 이력
- 토큰 로그
- 감사로그
- 전송 로그
- 가명 매핑
- 연구 반출 데이터셋
- 백업 데이터

실환자 전환 전 `retention_policy` 문서와 자동 파기 또는 법정 보존 근거가 필요하다.
