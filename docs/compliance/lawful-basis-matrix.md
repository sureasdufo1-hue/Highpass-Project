# Lawful Basis Matrix

검토 기준일: 2026-08-26

이 매트릭스는 법적 근거 후보를 정리한 것이다. 실제 운영 근거 확정은 병원, 법무, 개인정보보호책임자의 승인 사항이다.

| 처리 | 데이터 | 근거 후보 | 구현 통제 | 구현 위치 | 판정 | 미충족 위험 |
|---|---|---|---|---|---|---|
| 환자 동의 생성 | Consent, Study/Series scope | 정보주체 동의, 의료기관 간 진료정보 전달 | 목적/기간/병원/범위 지정 | `POST /api/consents` | PARTIAL | 동의서 법정 문구와 본인확인 미확정 |
| 의료진 조회 요청 | Doctor, purpose, requestedAction | 진료 목적, 수신 병원 권한 | RBAC + ABAC fail closed | `POST /api/dicom-access/request` | PASS | 실제 재직·담당환자 검증 미연동 |
| DICOMweb 조회 | 의료영상, metadata | 환자 동의 범위 내 제공 | 단기 token, mTLS, Gateway scope | `/dicomweb/*` | PASS | 실제 PACS 연동 시 병원별 계약 필요 |
| 다운로드 | 원본 DICOM | 별도 동의 또는 병원 정책 | VIEW_ONLY 다운로드 차단 | Gateway | PASS | 화면캡처/DLP 미구현 |
| 감사로그 | 접속기록 | 안전성 확보조치, 분쟁 대응 | 표준 필드, hash chain | `audit_logs` | PASS | 외부 WORM/SIEM 미연동 |
| 연구 반출 | 가명정보 | 가명정보 처리, IRB/심의 후보 | 승인 상태, 가명처리 시뮬레이션 | research export modules | PARTIAL | 실제 심의, defacing, KMS 미완료 |
| 처리위탁 | DB/Cloud/Monitoring | 위탁계약 | processor map | 문서 | BLOCKED | 실제 수탁자 계약 없음 |
| 국외 이전 | Cloud/로그 | 별도 고지·동의 또는 법정 요건 | 미구현 | 문서 | BLOCKED | 리전·하위처리자 미정 |
