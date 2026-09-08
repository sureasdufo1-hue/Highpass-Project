# Commercialization Backlog

| 우선순위 | 항목 | MVP 상태 | 상용화 완료 조건 |
|---|---|---|---|
| P0 | PIPA 법률 적합성·동의문 | DEFERRED | CPO/법무 승인 |
| P0 | ISMS-P 적용성·인증 | DEFERRED | 적용성 결정 및 정식 심사 |
| P0 | 병원 보안성 심의 | DEFERRED | 대상 병원 승인 |
| P0 | 개인정보 영향평가 | DEFERRED/BLOCKED | 실제 처리·인프라 기준 평가 |
| P0 | 위탁·하위수탁·국외이전 계약 | BLOCKED | 사업자·리전 확정 및 계약 |
| P0 | 실제 IdP/MFA·계정 회수 | BLOCKED | 병원 테스트 tenant E2E |
| P0 | KMS/HSM·DB/백업 암호화 | BLOCKED | fail-closed 및 rotation 증적 |
| P0 | WORM/SIEM 감사로그 | BLOCKED | 불변 저장·관리자 삭제 차단 |
| P1 | 실제 PACS/DICOMweb | BLOCKED | 승인된 테스트망 E2E |
| P1 | PostgreSQL TLS verify-full | BLOCKED | 외부 Staging TLS 증적 |
| P1 | Registry digest promotion | BLOCKED | build/promotion/runtime digest 일치 |
| P1 | 외부 Staging·침투테스트 | BLOCKED | 독립 환경 검증·조치 완료 |
| P1 | DR 및 RTO/RPO | BLOCKED | 독립 복구훈련·경영 승인 |
| P1 | 연구영상 defacing·재식별 평가 | DEFERRED | 전문가 검증·IRB/심의 |

로컬 PASS를 운영 승인이나 인증으로 승격하지 않는다.
