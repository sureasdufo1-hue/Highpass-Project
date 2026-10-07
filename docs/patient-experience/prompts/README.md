# Patient Experience Specification Prompt Protocol

## 1. 사용 목적

이 디렉터리의 Prompt는 기능 명세를 재생성·검토할 때 사용하는 공식 작성 지시다. Prompt 자체는 제품 요구사항이나 구현 완료 증거가 아니며, 같은 번호의 `*-SPEC.md`가 승인 결과다.

## 2. 공통 입력 기준

모든 Prompt는 최소한 다음 문서를 먼저 읽도록 요구한다.

- `AGENTS.md`
- `docs/CAPSTONE-MVP-BOUNDARY.md`
- `docs/PRODUCT-BASELINE.md`
- `docs/REQUIREMENTS.md`
- `docs/SECURITY-REQUIREMENTS.md`
- `docs/DOMAIN-MODEL.md`
- `docs/DATA-MODEL.md`
- `docs/SYSTEM-ARCHITECTURE.md`
- `docs/MOBILE-UI-UX-SPEC.md`
- `docs/MOBILE-NAVIGATION-AND-STATE-MODEL.md`
- `docs/MOBILE-APPLICATION-REQUIREMENTS.md`
- `docs/MOBILE-SCREEN-DESIGN-SPEC.md`
- `docs/MOBILE-API-CONTRACT.md`
- `docs/THREAT-MODEL.md`
- `docs/ACCEPTANCE-TESTS.md`
- `docs/patient-experience/README.md`
- `docs/patient-experience/PATIENT-EXPERIENCE-FEATURE-ROADMAP.md`

기능별 Prompt에 추가 입력이 명시되면 함께 읽는다. 충돌 시 승인된 Scope → Security → Domain/Architecture → API → UI 문서 순으로 판단하고 충돌을 숨기지 않는다.

## 3. 공통 작성 계약

산출물에는 반드시 다음을 포함한다.

1. 문서 Metadata와 `Not Implemented / Not Tested` 상태
2. 의사결정 요약, 목표, 비범위, Actor
3. 정상·실패·거부·오프라인 사용자 흐름
4. 화면/Component와 상태 모델
5. 검증 가능한 기능 요구사항 ID
6. 보안·개인정보 요구사항 ID
7. 논리 Domain/Data와 보존·삭제 정책
8. 필요한 업무 행위 API와 현재 GAP
9. Audit Event와 민감정보 금지 항목
10. 접근성·국제화 요구사항
11. 위협·통제 매핑
12. Acceptance Test ID와 예상 결과
13. 구현 Ticket, 선행조건, 완료 경계

## 4. 금지 사항

- 구현·시험하지 않은 기능을 구현 완료 또는 PASS로 표시하지 않는다.
- UI 상태, QR, 딥링크, Push, 로컬 설정을 권한으로 취급하지 않는다.
- 실제 환자정보, 운영 PACS Credential, Secret, DICOM Payload 예시를 포함하지 않는다.
- 진단·정상/이상 여부를 추론하거나 의료적 조언을 생성하지 않는다.
- 문서에 없는 API·DB 객체를 현재 Contract처럼 단정하지 않는다.
- POST-MVP 기능을 P1 일정에 조용히 포함하지 않는다.

## 5. 품질 판정

문서는 요구사항마다 시험 가능한 `shall` 수준의 문장과 거부 조건이 있어야 한다. 단순 화면 목록, 마케팅 문구, Happy Path만 있는 결과는 승인하지 않는다.
