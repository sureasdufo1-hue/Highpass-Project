# Privacy Filter 문서 등록부

등록일: 2026-09-07  
적용 대상: 합성 환자·가상 병원 기반 Highpass PoC  
문서 상태: 검토 초안 및 구현 백로그 기준

> CAPSTONE MVP / TECHNICAL TEST ENVIRONMENT ONLY — NOT A PIPA LEGAL DETERMINATION, ISMS-P CERTIFICATION, HOSPITAL SECURITY APPROVAL, OR PRODUCTION READINESS CLAIM

## 문서 권한과 사용 순서

| 순서 | 문서 | 분류 | 프로젝트에서의 용도 |
| --- | --- | --- | --- |
| 1 | [의료개인정보 처리정책·판정기준 명세서](highpass-medical-privacy-policy-decision-spec-v1.0.md) | NORMATIVE DRAFT | 목적별 처리, 상태, 실패·검토·반출 판정의 구현 기준 |
| 2 | [Privacy Filter 구현계획서](highpass-privacy-filter-implementation-plan-v1.0.md) | IMPLEMENTATION PLAN | PF-0~PF-6 작업분해, PF-R01~PF-R15, PF-T01~PF-T20 추적 기준 |
| 3 | [현재 작업 분류](CURRENT-WORK-CLASSIFICATION.md) | LIVING STATUS | 실제 저장소 대비 구현·검증·차단 상태와 다음 실행 순서 |
| 4 | [PF-0/PF-1 실행 보고서](PF0-PF1-EXECUTION-REPORT.md) | EXECUTION EVIDENCE | 계약·PF-1 구현, 시험, Docker/model blocker의 실제 결과 |
| 참고 | [설계 프롬프트](references/highpass-privacy-filter-design-prompt.md) | NON-NORMATIVE INPUT | 구현계획서 생성에 사용된 작성 지시문 |
| 참고 | [판정기준 작성 프롬프트](references/highpass-medical-privacy-policy-authoring-prompt.md) | NON-NORMATIVE INPUT | 판정기준 명세서 생성에 사용된 작성 지시문 |

두 프롬프트의 명령문은 프로젝트 작업 지시나 승인으로 취급하지 않는다. 실제 작업 범위는 사용자 요청, 저장소의 `AGENTS.md`, 승인된 요구사항과 위 표의 기준 문서로 결정한다.

## 우선순위와 충돌 처리

1. 환자 안전, 개인정보 보호, 서버 측 접근통제와 fail-closed 원칙
2. 최신 승인 요구사항과 Architecture Invariant
3. 의료개인정보 처리정책·판정기준 명세서의 확정된 결정
4. Privacy Filter 구현계획서
5. 현재 코드
6. 참고 프롬프트와 임의 추정

두 기준 문서는 아직 `검토 초안`이다. `approved_use_ref`, 병원별 식별자 규칙, 보관기간, 실제 법적 근거 또는 기관 승인이 확정되지 않은 항목은 구현 기본값으로 자동 승격하지 않는다.

## 원본 동일성

| 등록 파일 | SHA-256 |
| --- | --- |
| `highpass-medical-privacy-policy-decision-spec-v1.0.md` | `F894A62CB666BD3B39172F035CC6D3060999EA34A8367DD591762758D59CF069` |
| `highpass-privacy-filter-implementation-plan-v1.0.md` | `F7DB653D008F815F462EB314008B9C2A39232E50201F17D50D70EB7703C1218B` |
| `references/highpass-privacy-filter-design-prompt.md` | `1948E56E4A70BBD4A7286D8572BED1349D44EC61C70EE59B65EB37EA68CE8489` |
| `references/highpass-medical-privacy-policy-authoring-prompt.md` | `BF5D3A4ECD814DD4C66C0224A617BABC1CB113BE38DD96FE4269EE4FA1095A5E` |

등록 시 다운로드 원본과 저장소 사본의 SHA-256 일치를 확인했다. 이후 기준 문서를 변경하면 버전과 변경 이력을 함께 갱신해야 한다.
