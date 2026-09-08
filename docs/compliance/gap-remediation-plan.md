# Gap Remediation Plan

검토 기준일: 2026-08-26

| 우선순위 | Gap | 조치 | 책임 역할 | 완료 기준 |
|---|---|---|---|---|
| P0 | 법적 역할과 동의서 | 개인정보처리자/수탁자/공동처리자 역할 확정, 동의서 문구 법무 검토 | Project Owner, Legal, CPO | 승인 문서 |
| P0 | 위탁·클라우드 계약 | 수탁자, 하위수탁자, 리전, 사고통지, 삭제/반환 조항 확정 | Project Owner | 계약서 |
| P0 | 실제 인증 | 병원 IdP/OIDC, MFA, 퇴직자 회수 연동 | Security Owner | 외부 Staging 테스트 PASS |
| P0 | 운영 암호화 | KMS/HSM, DB/백업 암호화, 키교체 절차 | PKI Owner | KMS fail-closed test PASS |
| P0 | 불변 감사로그 | SIEM/WORM 저장, 관리자 삭제 차단 운영증적 | Security Owner | WORM 쓰기/조회 검증 |
| P1 | 실제 PACS 테스트 | 병원 테스트망 DICOMweb 연동 | Integration Owner | 승인된 테스트 PACS E2E |
| P1 | DR 실증 | 별도 복구 환경, RTO/RPO 승인 | Ops Owner | DR drill report |
| P1 | 침투테스트 | 외부 취약점 진단과 조치 | Security Owner | 조치 완료 보고서 |
| P1 | 데이터 파기 | 보유기간 확정, 백업 파기 검증 | Data Owner | 파기 테스트 증적 |
