# MediQ Patient Convenience Expansion Specification

**Document ID:** `MEDIQ-PXE-CX-001`  
**Ticket:** `MEDIQ-AIQ-001`  
**Version:** v1.0  
**Classification:** `CAPSTONE-P1` with `POST-MVP` exceptions  
**Status:** Approved Design Baseline — HTML Prototype Partial / Product Not Implemented / Not Tested  
**Date:** 2026-09-26

## 1. 결정 요약

기존 환자 경험 기능 1–9 위에 “찾기, 이해하기, 준비하기, 오류를 바로잡기” 계층을 추가한다. 의료적 판단을 새로 만들지 않고 기존 서버 권위 상태와 Synthetic Health Data Preview를 환자 중심으로 재구성한다.

## 2. 기능 분류

| ID | 기능 | 분류 | 결정 |
|---|---|---|---|
| `PXE-CX-01` | 통합 건강 타임라인 | P1 | 영상·검사·문서·접근이력을 날짜순 Projection으로 표시 |
| `PXE-CX-02` | 쉬운 모드·고령자 모드 | P1 | 큰 글씨, 높은 대비, 한 화면 한 Primary CTA |
| `PXE-CX-03` | 데이터 최신성·누락 안내 | P1 | 없음·미연결·동의필요·동기화중·지연을 구분 |
| `PXE-CX-04` | 통합 검색·즐겨찾기 | P1 | 날짜·유형·기관·상태 검색, 즐겨찾기는 권한 아님 |
| `PXE-CX-05` | 진료 준비 메모·질문 목록 | P1 | 환자 작성 메모, 의무기록 아님, 기기 암호화 저장 |
| `PXE-CX-06` | 검사결과 변화 그래프 | P1 Prototype | 동일 코드·단위·검사법만 연결, 판정 생성 금지 |
| `PXE-CX-07` | 기록 오류·정정 요청 | P1 | 원본 직접 수정 없이 출처기관 확인 Case 생성 |
| `PXE-CX-08` | 방문용 자료 꾸러미 | P1 | 영상·검사·문서·질문 선택, 자원별 권한 유지 |
| `PXE-CX-09` | 예약·검사 일정 | P1 Manual / POST-MVP Integration | MVP 수동 일정, 병원 API는 미래 |
| `PXE-CX-10` | 응급 최소 건강카드 | POST-MVP | 노출·최신성·법적 Gate 전 비활성 |

## 3. 공통 사용자 흐름

```text
Action Center
  → 통합 타임라인/검색
  → 기록 선택
      ├→ 원본/상세 보기
      ├→ 즐겨찾기
      ├→ 관련 기록 보기
      ├→ 진료 질문에 추가
      ├→ 정정 요청
      └→ 방문 자료 꾸러미에 추가
```

쉬운 모드는 모든 화면에 적용되는 표현 설정이며 권한·데이터·상태를 변경하지 않는다.

## 4. 화면·상태 계약

| 논리 ID | 화면/Component | 필수 상태 |
|---|---|---|
| `MOB-PXE-CX-001` | 통합 건강 타임라인 | Loading, Empty, Partial, Offline, Stale |
| `MOB-PXE-CX-002` | 검색·Filter·즐겨찾기 | No result, Permission changed |
| `MOB-PXE-CX-003` | 데이터 연결·최신성 | Current, Delayed, Consent required, Not connected, Not provided |
| `MOB-PXE-CX-004` | 쉬운 모드 설정 | Default, Large text, High contrast, Reduced complexity |
| `MOB-PXE-CX-005` | 진료 준비 Workspace | Draft, Local saved, Added to packet |
| `MOB-PXE-CX-006` | 검사 추세 | Comparable, Unit conflict, Method conflict, Missing |
| `MOB-PXE-CX-007` | 기록 정정 요청 | Draft, Submitted, Source reviewing, Resolved, Rejected |
| `MOB-PXE-CX-008` | 방문 자료 꾸러미 | Draft, Scope review, Ready, Expired |
| `MOB-PXE-CX-009` | 일정 | Manual, Reminder enabled, Institution sync unavailable |

논리 ID는 기존 Mobile 77개 기준선에 자동 합산하지 않는다.

## 5. 기능 요구사항

| ID | 요구사항 |
|---|---|
| `REQ-PXE-CX-001` | 타임라인은 자원 종류, 발생일, 출처, 최신성, Synthetic 여부를 함께 표시해야 한다. |
| `REQ-PXE-CX-002` | 관련 기록은 명시된 Link/Encounter 또는 사용자 선택만 사용하고 인과관계를 추론하지 않아야 한다. |
| `REQ-PXE-CX-003` | 쉬운 모드는 130~160% 글씨, 높은 대비, 명확한 행동명과 한 개의 Primary CTA를 제공해야 한다. |
| `REQ-PXE-CX-004` | 데이터 부재는 `기록 없음`, `기관 미연결`, `동의 필요`, `제공 지연`, `기관 미제공`으로 구분해야 한다. |
| `REQ-PXE-CX-005` | 검색은 허용된 Projection 필드만 사용하며 Free-text 진단정보를 Index에 복제하지 않아야 한다. |
| `REQ-PXE-CX-006` | 즐겨찾기와 방문 꾸러미 선택은 Consent·Authorization·Grant를 생성하거나 연장하지 않아야 한다. |
| `REQ-PXE-CX-007` | 진료 질문 메모는 환자 작성 정보로 표시하고 임상기록·의뢰서와 구분해야 한다. |
| `REQ-PXE-CX-008` | 검사 추세는 동일 코드·단위·검사법의 값만 연결하고 충돌 시 그래프를 분리해야 한다. |
| `REQ-PXE-CX-009` | 검사 추세는 정상·비정상·질환·면역 상태를 MediQ가 계산하지 않아야 한다. |
| `REQ-PXE-CX-010` | 정정 요청은 원본을 수정하지 않고 출처기관 Case와 정정 Version을 연결해야 한다. |
| `REQ-PXE-CX-011` | 방문 꾸러미는 포함 자원, 목적지, 행위, 만료를 자원별로 검토하게 해야 한다. |
| `REQ-PXE-CX-012` | MVP 일정은 환자 수동 입력만 허용하고 병원 예약 확정 상태로 표시하지 않아야 한다. |
| `REQ-PXE-CX-013` | 응급 건강카드는 별도 POST-MVP 승인 전 화면 Demo와 실제 노출을 제공하지 않아야 한다. |

## 6. 보안·개인정보 요구사항

| ID | 요구사항 |
|---|---|
| `SEC-PXE-CX-001` | 모든 Projection은 Tenant/Patient/Resource 접근 검증 후 반환해야 한다. |
| `SEC-PXE-CX-002` | 즐겨찾기·검색 Index·질문 메모는 Mobile Vault 또는 승인된 암호화 저장소에 보관해야 한다. |
| `SEC-PXE-CX-003` | 동기화 상태와 관련 Link는 접근권한 증거가 아니며 상세 진입 시 재검증해야 한다. |
| `SEC-PXE-CX-004` | 정정 요청에 불필요한 진단·식별정보 자유입력을 유도하지 않아야 한다. |
| `SEC-PXE-CX-005` | 방문 꾸러미 생성은 기존 Consent/Authorization/Grant를 우회하지 않아야 한다. |
| `SEC-PXE-CX-006` | Notification에는 일정 제목, 검사값, 질문 메모, 기관명을 기본 노출하지 않아야 한다. |
| `SEC-PXE-CX-007` | 쉬운 모드는 보안 경고·만료·거부 문구를 숨기거나 자동 승인으로 바꾸지 않아야 한다. |
| `SEC-PXE-CX-008` | 응급카드는 Lock-screen Disclosure·Revocation·최신성·감사정책 승인 전 비활성화해야 한다. |

## 7. API·Data GAP

필요 후보는 `ListMyTimeline`, `SearchMyRecords`, `GetDataAvailability`, `CreateCorrectionCase`, `CreateVisitPacket`이다. 현재 `OPENAPI.yaml` 승인 Contract가 아니며 구현 전 업무 행위·권한·오류·보존정책을 함께 개정한다.

쉬운 모드와 합성 Timeline은 Local Prototype으로 먼저 구현할 수 있다. 정정 Case와 방문 꾸러미는 Domain/Data/ERD와 Audit 개정이 필요하다.

## 8. Acceptance

| ID | 시나리오 | 예상 결과 |
|---|---|---|
| `TC-PXE-CX-001` | 합성 영상·검사·이력 Timeline | 날짜·유형·출처·SYNTHETIC 상태 표시 |
| `TC-PXE-CX-002` | 기관 미연결/지연 | 데이터 없음으로 합치지 않고 정확한 상태 표시 |
| `TC-PXE-CX-003` | 쉬운 모드 | 큰 글씨·높은 대비에서도 핵심 CTA와 경고 유지 |
| `TC-PXE-CX-004` | 검색·즐겨찾기 | 권한 없는 자원 미노출, 즐겨찾기로 권한 상승 없음 |
| `TC-PXE-CX-005` | 단위·검사법 충돌 | 추세 그래프 분리, 값 변환·추정 없음 |
| `TC-PXE-CX-006` | 정정 요청 | 원본 불변, Case Reference와 상태 표시 |
| `TC-PXE-CX-007` | 방문 꾸러미 | 자원별 Scope/만료 검토, Preflight 우회 없음 |
| `TC-PXE-CX-008` | 수동 일정 | 병원 확정 예약으로 표시하지 않음 |
| `TC-PXE-CX-009` | 응급카드 Route | POST-MVP Gate로 비활성 |

모든 기능 시험은 `NOT RUN`이다.

## 9. 구현 순서

```text
P1-A: 쉬운 모드 → 합성 Timeline → 검색/즐겨찾기 → 최신성 안내
P1-B: 질문 메모 → 합성 검사 추세 → 수동 일정
P1-C: 정정 요청 → 방문 꾸러미
POST-MVP: 병원 일정 API → 응급 건강카드
```

## 10. 완료 경계

현재 HTML Prototype은 일부 동작을 시각화할 수 있으나 제품 구현이 아니다. 실제 API, Android 화면, 암호화 저장, 정정기관 연동, 병원 예약 API와 응급 노출은 구현·시험되지 않았다.
