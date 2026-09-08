# Compliance Risk Register

검토 기준일: 2026-08-26

| Risk ID | 자산·업무 | 위협 | 취약점 | 법률·기준 | 영향 | 가능성 | 위험도 | 기존 통제 | 추가 조치 | 책임 역할 | 목표일 | 상태 |
|---|---|---|---|---|---:|---:|---:|---|---|---|---|---|
| R-P0-001 | 실환자 전환 | 부적법 처리 | 법적 역할·동의서 미확정 | PIPA, 의료법 | 5 | 4 | 20 | 동의 모델 | 법무/CPO 승인 | Project Owner | 운영 전 | P0 |
| R-P0-002 | 위탁·클라우드 | 계약 누락 | 수탁자/하위수탁자 미정 | PIPA 위탁, Cloud Act | 5 | 4 | 20 | processor map | 계약/리전/국외이전 확정 | Project Owner | 운영 전 | P0 |
| R-P0-003 | 인증 | 계정 탈취 | 실제 IdP/MFA 미연동 | ISMS-P 접근통제 | 5 | 3 | 15 | mock/JWT tests | 병원 OIDC, MFA | Security Owner | Staging 전 | P0 |
| R-P0-004 | 저장 암호화 | DB/로그 유출 | 운영 KMS/HSM 없음 | 안전성 확보조치 | 5 | 3 | 15 | local secret gates | KMS envelope encryption | PKI Owner | Staging 전 | P0 |
| R-P0-005 | 감사 무결성 | 로그 변조 | WORM/SIEM 미연동 | ISMS-P 로그관리 | 4 | 4 | 16 | hash chain | 중앙 불변 로그 | Security Owner | Staging 전 | P0 |
| R-P1-001 | 실제 PACS | 오연동/과다조회 | 병원별 테스트 PACS 없음 | 의료법/PIPA | 4 | 3 | 12 | Orthanc PoC | 병원 테스트망 계약 | Integration Owner | Staging | P1 |
| R-P1-002 | DR | 장애 장기화 | 독립 DR site 없음 | Cloud/ISMS-P | 4 | 3 | 12 | local backup docs | DR drill | Ops Owner | Staging | P1 |
| R-P1-003 | 취약점 | 공급망 위험 | 외부 pentest 없음 | ISMS-P 취약점 | 4 | 3 | 12 | container gate/SBOM | 외부 진단 | Security Owner | Staging | P1 |
| R-P1-004 | 연구 반출 | 재식별 | defacing 실증 부족 | 보건의료데이터 가이드 | 5 | 2 | 10 | high-risk flag | defacing 검증 | Data Owner | 연구 전 | P1 |
| R-P2-001 | 관제 | 탐지 지연 | human alert 채널 미연동 | ISMS-P 모니터링 | 3 | 3 | 9 | ops monitor | SIEM/on-call | Ops Owner | 운영 고도화 | P2 |
