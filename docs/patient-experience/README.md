# MediQ Patient Experience Feature Pack

**Document Set:** Patient Experience Features 1–9  
**Ticket:** `MEDIQ-DOC-002`  
**Version:** v1.2  
**Date:** 2026-09-26  
**Status:** Approved Documentation Baseline — Not Implemented

## 1. 목적

이 문서군은 환자가 의료영상 이동·열람·보관 과정을 더 쉽게 이해하고 통제하도록 돕는 아홉 기능의 제품·보안·구현 기준을 정의한다. 기능 명세는 기존 Consent, Authorization, Transfer Grant, Tenant Isolation, DICOMweb 및 Mobile Secure Vault 기준을 확장 설명할 뿐 우회하지 않는다.

## 2. 범위와 우선순위

| 번호 | 기능 | 분류 | 구현 우선순위 | 상태 |
|---:|---|---|---|---|
| 1 | 통합 행동센터 | `CAPSTONE-P1` | P1-A | 명세 승인, 미구현 |
| 2 | 환자용 접근이력·동의 영수증 | `CAPSTONE-P1` | P1-A | 명세 승인, 미구현 |
| 3 | 개인정보 최소 알림 | `CAPSTONE-P1` | P1-A | 명세 승인, 미구현 |
| 4 | 병원 방문 모드 | `CAPSTONE-P1` | P1-B | 명세 승인, 미구현 |
| 5 | 쉬운 의료영상 카드 | `CAPSTONE-P1` | P1-A | 명세 승인, 미구현 |
| 6 | 저장공간·만료 관리 | `CAPSTONE-P1` | P1-A | 명세 승인, 미구현 |
| 7 | 환자 친화 오류 복구 | `CAPSTONE-P1` | P1-A | 명세 승인, 미구현 |
| 8 | 판독문·의뢰서 묶음 | `POST-MVP` | Future | 명세 승인, 미구현 |
| 9 | 보호자·가족 위임 | `POST-MVP` | Future | 명세 승인, 미구현 |

P0 E2E와 P0 Security Validation을 완료하기 전에는 본 기능군이 P0 일정의 차단 조건이 되어서는 안 된다. 8·9번은 설계 기준만 등록하며 P1 구현 약속으로 해석하지 않는다.

## 3. 문서 구조

각 기능은 작성 지시를 고정하는 `*-PROMPT.md`와 승인 가능한 결과인 `*-SPEC.md` 한 쌍으로 관리한다. 공통 계획은 [로드맵](PATIENT-EXPERIENCE-FEATURE-ROADMAP.md), 전체 ID 연결은 [추적성 매트릭스](PATIENT-EXPERIENCE-TRACEABILITY.md)를 따른다.

## 4. 공통 보안 불변조건

- 기본 정책은 `DENY BY DEFAULT`, 실패 정책은 `FAIL CLOSED`다.
- 화면·알림·QR·딥링크·저장된 선호값은 권한 증거가 아니다.
- 모든 보호 자원 접근은 인증, Tenant, 환자 매핑, Consent, Authorization, 목적별 Grant와 만료를 서버에서 재검증한다.
- 앱은 PACS Credential, KEK, 서버 Secret 또는 장기 Access Token을 받지 않는다.
- 잠금화면 알림과 앱 전환 화면에는 환자명, 검사 설명, 진단, 병원명을 기본 노출하지 않는다.
- 감사 원장은 서버 기록이 권위 원본이며 환자 화면은 최소화된 Projection이다.
- 실제 환자정보와 운영 DICOM은 현재 범위에서 사용하지 않는다.
- UI 성공 표시는 서버 확정 상태만 사용하며 `RESULT_UNKNOWN`을 성공으로 해석하지 않는다.

## 5. 승인 및 구현 규칙

1. 각 기능 Ticket은 관련 요구사항·보안·Acceptance ID를 선택한다.
2. API가 필요하면 `OPENAPI.yaml` 개정 전에는 `API GAP`으로 유지한다.
3. 영속 객체가 필요하면 Domain/Data/ERD와 Migration을 같은 구현 Ticket에서 개정한다.
4. 화면 ID는 본 문서군의 논리 ID이며 기존 77개 Mobile Screen 기준선에 자동 합산하지 않는다.
5. 코드 변경 시 `docs/implementation/<TICKET>/`에 구현 보고서와 실제 테스트 증거를 남긴다.
6. 구현·시험 전 상태는 `PLANNED`; 실행 증거 없는 기능은 `PASS`로 표시하지 않는다.

## 6. 문서 색인

| 기능 | 작성 프롬프트 | 정식 명세 |
|---|---|---|
| 1 | [Prompt](prompts/01-ACTION-CENTER-PROMPT.md) | [Spec](01-ACTION-CENTER-SPEC.md) |
| 2 | [Prompt](prompts/02-PATIENT-ACCESS-RECEIPT-PROMPT.md) | [Spec](02-PATIENT-ACCESS-RECEIPT-SPEC.md) |
| 3 | [Prompt](prompts/03-PRIVACY-SAFE-NOTIFICATIONS-PROMPT.md) | [Spec](03-PRIVACY-SAFE-NOTIFICATIONS-SPEC.md) |
| 4 | [Prompt](prompts/04-HOSPITAL-VISIT-MODE-PROMPT.md) | [Spec](04-HOSPITAL-VISIT-MODE-SPEC.md) |
| 5 | [Prompt](prompts/05-PLAIN-LANGUAGE-IMAGING-CARDS-PROMPT.md) | [Spec](05-PLAIN-LANGUAGE-IMAGING-CARDS-SPEC.md) |
| 6 | [Prompt](prompts/06-STORAGE-AND-EXPIRY-MANAGEMENT-PROMPT.md) | [Spec](06-STORAGE-AND-EXPIRY-MANAGEMENT-SPEC.md) |
| 7 | [Prompt](prompts/07-PATIENT-FRIENDLY-ERROR-RECOVERY-PROMPT.md) | [Spec](07-PATIENT-FRIENDLY-ERROR-RECOVERY-SPEC.md) |
| 8 | [Prompt](prompts/08-RADIOLOGY-REPORT-REFERRAL-BUNDLE-PROMPT.md) | [Spec](08-RADIOLOGY-REPORT-REFERRAL-BUNDLE-SPEC.md) |
| 9 | [Prompt](prompts/09-GUARDIAN-FAMILY-DELEGATION-PROMPT.md) | [Spec](09-GUARDIAN-FAMILY-DELEGATION-SPEC.md) |

## 7. 완료 경계

이 문서군의 완료는 아홉 기능의 범위, 거부 조건, 필요한 화면·API·데이터·시험과 구현 순서가 추적 가능하다는 뜻이다. 애플리케이션 코드, API, DB Migration, 알림 인프라, 법적 적합성 검토 또는 실제 의료기관 연동 완료를 뜻하지 않는다.

## 8. 합성 건강정보 Preview 연결

환자 편의를 위해 행동센터·쉬운 영상 카드에서 건강검진·일반 혈액검사·항체검사의 합성 Preview로 이동할 수 있다. 이 Preview는 기능 1–9의 권한이나 데이터 범위를 확장하지 않는 독립 Optional P1 Module이며 `SYNTHETIC-HEALTH-DATA-PREVIEW.md`를 따른다. 검사와 영상의 `관련 기록` 연결은 편의 표현일 뿐 진단·인과관계 또는 공유 권한을 의미하지 않는다.

## 9. 편의 기능 확장과 AI 질문자료

- [Patient Convenience Expansion](PATIENT-CONVENIENCE-EXPANSION-SPEC.md)은 통합 타임라인, 쉬운 모드, 최신성 표시, 검색·즐겨찾기, 진료 질문, 검사 추세, 정정 요청, 방문 자료 꾸러미와 수동 일정을 정의한다.
- [External LLM Question Pack](EXTERNAL-LLM-QUESTION-PACK-SPEC.md)은 합성 검사자료를 최소화한 질문 Text로 만들고 사용자가 검토한 뒤 Local Clipboard에 복사하는 P1 시연 기준을 정의한다.
- MVP는 외부 LLM API, Provider Deep Link, 자동 Paste·Upload·Send를 제공하지 않는다.
- 실제 건강정보의 Copy·Capture·외부 제공은 `PRODUCTIONIZATION` Gate가 승인될 때까지 비활성이다.

## 10. 합성 환자 설명·질문 준비 RAG

[AI 문서군](../ai/README.md)은 외부 LLM 복사와 구분되는 Local Synthetic RAG를 정의한다. RAG는 승인된 합성 지식팩만 검색하여 화면 필드를 설명하고 의료진에게 물어볼 질문을 준비한다. 진단·처방·영상판독·인터넷 검색·실제 환자정보·외부 AI 전송은 포함하지 않는다.
