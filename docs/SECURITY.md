# Highpass 보안 기준 문서

상태: **MVP 기술시험 기준 / 운영 승인 아님**  
기준일: 2026-09-07

## 보안 경계

- Control Plane은 인증 주체, 동의, RBAC+ABAC 정책, 단기 토큰, 최소 메타데이터, 감사로그를 관리합니다.
- Data Plane/Gateway는 승인된 DICOMweb 요청만 PACS/Orthanc로 전달합니다.
- 브라우저는 PACS/Orthanc에 직접 접근하지 않습니다.
- 모든 중요 허용행위는 서버 측에서 정책을 재검증하고 감사로그를 남깁니다.
- 동의·토큰·기관·사용자·Study/Series 범위가 하나라도 맞지 않으면 Fail Closed 합니다.

## 현재 통제와 한계

| 통제 | 현재 상태 |
|---|---|
| RBAC+ABAC·동의·단기 토큰 | 코드 및 자동시험 확인 |
| 토큰 원문 저장 금지 | digest 기반 구현 확인 |
| 감사 Hash Chain·이상행위 | 로컬 MVP 시험 확인 |
| TLS/mTLS | 구성·fixture 존재, 최신 Compose E2E 재검증 필요 |
| 실제 IdP/MFA | 미검증·외부 자원 필요 |
| KMS/HSM·WORM/SIEM·DR | 미검증·운영 전 필수 |
| 실제 PACS·모바일 Vault | 미검증 또는 미구현 |

상세 기존 문서는 [보안 위협모델](security/threat-model.md), [DICOM 접근 흐름](security/dicom-access-flow.md), [운영 준비도](security/production-readiness.md)를 참조합니다.
