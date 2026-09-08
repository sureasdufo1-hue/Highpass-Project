# Hospital Security Review Checklist

검토 기준일: 2026-08-26

| 항목 | 분류 | 현재 통제 | 증적 | 판정 | 보완 |
|---|---|---|---|---|---|
| 환자-영상 매칭 정확성 | 기술적 | Study/Series scope | HTTPS E2E | PARTIAL | 실제 MPI/환자확인 연동 |
| 송신/수신 병원 권한 | 기술적 | source/target hospital ABAC | policy tests | PASS | 병원 계약 승인 |
| 동의 생성·철회·만료 | 기술적/관리적 | Consent lifecycle | E2E | PARTIAL | 법정 동의서 문구 |
| 의료진 소속 검증 | 기술적 | doctorHospitalId 검증 | tests | PARTIAL | 실제 재직 API |
| 비인가 열람 방지 | 기술적 | fail closed Gateway | Network/E2E | PASS | 운영 WAF |
| Break-glass | 관리적 | 미구현 | 없음 | BLOCKED | 별도 요구사항 승인 |
| DICOM 태그 개인정보 | 기술적 | 가명처리 시뮬레이션 | tests | PARTIAL | 운영 defacing 검증 |
| 전송 중 암호화 | 기술적 | HTTPS/mTLS | EV-MTLS-001 | PASS | 운영 CA |
| 저장 시 암호화 | 기술적 | 미검증 | 없음 | BLOCKED | DB/KMS/volume encryption |
| 인증서 교체·폐기 | 관리적/기술적 | dev cert lifecycle | ops expiry | PARTIAL | 운영 PKI |
| Tenant 격리 | 기술적 | Docker network 분리 | Network Gate | PARTIAL | 클라우드 계정/VPC 격리 |
| Orthanc 직접 접근 차단 | 기술적 | internal network | Network Gate | PASS | 클라우드 SG 재검증 |
| Viewer 접근통제 | 기술적 | token 전달/직접 접근 차단 | E2E | PARTIAL | 브라우저 DLP |
| 다운로드 제한 | 기술적 | VIEW_ONLY 서버 차단 | E2E | PASS | 화면캡처 정책 |
| 접속기록 위변조 방지 | 기술적 | hash chain | tests | PARTIAL | WORM storage |
| 관리자 행위 감사 | 기술적 | AuditLog | tests | PARTIAL | PAM 연동 |
| 사고 대응 | 관리적 | runbook | docs | PARTIAL | 모의훈련 |
| 오발송 회수 | 관리적/기술적 | token expiry/revoke | tests | PARTIAL | 수신 병원 삭제 확인 |
| 보유기간 파기 | 관리적 | dry-run | docs/tests | PARTIAL | 법정기간 확정 |
| 위탁/하위처리자 | 계약·법률 | processor map | docs | BLOCKED | 계약 체결 |
| 국외 이전 | 계약·법률 | 미정 | docs | BLOCKED | 리전/이전 통제 |
| 실제 환자정보 금지 | 관리적/기술적 | synthetic data only | AGENTS/tests | PASS | 운영 데이터 반입 통제 |
