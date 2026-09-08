# Data Flow and Inventory

검토 기준일: 2026-08-26

| 데이터 항목 | 개인정보 분류 | 처리 목적 | 법적 근거 후보 | 저장 위치 | 보유기간 | 암호화 | 접근 주체 | 파기방법 | 확인 상태 |
|---|---|---|---|---|---|---|---|---|---|
| 가상 환자 ID | 개인정보 후보 | 동의·영상 매핑 | 정보주체 동의, 진료정보 전달 | PostgreSQL `patients` | 조직 결정 필요 | DB/TLS 필요 | Patient, Doctor, Admin | 정책 기반 삭제 필요 | PARTIAL |
| 환자 이름/생년월일 | 민감 맥락 개인정보 | MVP 화면 표시 | 실서비스 최소화 필요 | PostgreSQL | 조직 결정 필요 | DB 암호화 미검증 | 제한 주체 | 삭제/마스킹 필요 | PARTIAL |
| 의료영상 원본 | 민감정보/건강정보 | 진료 목적 조회 | 환자 동의, 의료기관 요청 | Orthanc volume | 병원 정책 필요 | Data Plane TLS/mTLS | 승인 의료진 | 병원 PACS 정책 | PASS/PARTIAL |
| DICOM metadata | 건강정보 후보 | Study/Series 범위 제한 | 목적 제한, 최소처리 | PostgreSQL | 조직 결정 필요 | DB 암호화 미검증 | API/Gateway | 정책 기반 삭제 필요 | PARTIAL |
| Consent | 민감한 권리행사 기록 | 제3자 제공/전송 근거 | 정보주체 동의 | PostgreSQL `consents` | 법무 결정 필요 | DB 암호화 미검증 | Patient/Admin | 일반 삭제 금지 | PASS/PARTIAL |
| AccessTokenLog | 보안로그 | 단기 토큰 추적 | 안전성 확보조치 | PostgreSQL | 정책 결정 필요 | token hash 저장 | Security Admin | 보존 후 파기 | PASS |
| AuditLog | 접속기록/감사정보 | 추적·분쟁 대응 | 안전성 확보조치 | PostgreSQL | 법무 결정 필요 | hash chain | Security Admin | 임의 삭제 금지 | PASS |
| IP/User-Agent | 접속기록 | 보안 탐지 | 안전성 확보조치 | AuditLog | 법무 결정 필요 | 로그 보호 필요 | Security Admin | 보존 후 파기 | PARTIAL |
| 가명 매핑 | 고위험 추가정보 | 연구 재연결 | 가명정보 처리 | PostgreSQL | 별도 결정 필요 | KMS 미연동 | 제한 관리자 | 별도 승인 삭제 | PARTIAL |
| 연구 반출 데이터 | 가명정보/건강정보 | 연구·AI | 승인 및 가명처리 | 연구 export table | 심의 결정 필요 | 저장 암호화 미검증 | 승인 연구자 | 승인 만료 후 파기 | PARTIAL |

## Control Plane 저장 제한

Control Plane은 원본 DICOM 파일을 지속 저장하지 않는다. 현재 E2E는 `/api/transfer-usage`에서 DICM marker 부재를 확인한다.
