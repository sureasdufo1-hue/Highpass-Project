# MediQ Patient Experience Feature Roadmap

**Ticket:** `MEDIQ-DOC-002`  
**Version:** v1.1  
**Status:** Approved Planning Baseline

## 1. 의사결정

환자 편의 기능은 P0 Golden Path 위에 얹는 별도 제품 계층으로 구축한다. 우선 순서는 위험 감소와 재사용성을 기준으로 `기초 표현 → 행동·이력·알림 → 방문 오케스트레이션 → 미래 문서·위임`으로 고정한다.

```text
P0 인증·동의·인가·Grant·Audit·DICOMweb
                  ↓
P1-A 카드·오류·저장·이력·알림·행동센터
                  ↓
P1-B 병원 방문 모드
                  ↓
POST-MVP 판독문/의뢰서, 보호자/가족 위임
```

편의 확장과 AI 질문자료는 P0 완료를 차단하지 않는 P1 시연 계층이다.

```text
P1-C 통합 Timeline·쉬운 모드·검색·질문·합성 추세
                  ↓
P1-D 합성 AI 질문자료 Preview·Local Copy
                  ↓
PRODUCTIONIZATION 실제 건강정보 외부 제공 심사
```

## 2. 구현 Wave

| Wave | 기능 | 선행 Gate | 제안 Ticket |
|---|---|---|---|
| 0 | 공통 상태 Projection·오류 Taxonomy·접근성 토큰 | P0 API/State 안정화 | `MEDIQ-PXE-CORE-001` |
| 1 | 5 쉬운 카드, 7 오류 복구, 6 저장·만료 | Mobile Vault 기본 기능 | `MEDIQ-PXE-IC-001`, `ER-001`, `SE-001` |
| 2 | 2 접근이력·영수증, 3 알림 | Audit Projection, 알림 정책 | `MEDIQ-PXE-AR-001`, `NT-001` |
| 3 | 1 행동센터 | Wave 1·2 상태 API | `MEDIQ-PXE-AC-001` |
| 4 | 통합 Timeline·쉬운 모드·검색·합성 추세 | 합성 Projection | `MEDIQ-AIQ-001` |
| 5 | 합성 AI 질문자료 Preview·Local Copy | Wave 4, Allowlist·외부전송 차단 | `MEDIQ-AIQ-001` |
| 6 | 정정 Case·방문 자료 꾸러미 | Domain/API/Audit 개정 | `MEDIQ-PXE-CX-002` |
| Production | 실제 건강정보 Copy/Capture 또는 외부 LLM Connector | 개인정보·법률·Provider·국외이전 심사 | 별도 승인 Ticket |
| 4 | 4 병원 방문 모드 | QR Handoff·Destination Verification | `MEDIQ-PXE-VM-001` |
| 5 | 8 문서 묶음 | 별도 문서 상호운용 결정 | `MEDIQ-PXE-RR-001` |
| 6 | 9 위임 | 법적 권한·신원보증 결정 | `MEDIQ-PXE-GD-001` |

## 3. 공통 산출물 Gate

각 구현 Ticket은 다음을 한 작업으로 만든다.

| 영역 | 필수 산출물 |
|---|---|
| 제품 | 사용자 시나리오, 비범위, 상태·거부 경로 |
| UX | 화면/Component, Loading·Empty·Error·Offline·Denied 상태, 접근성 |
| API | 업무 행위 Contract, 오류 코드, idempotency, 권한 Scope |
| Data | 최소 Projection, 보존·삭제·TTL, Migration 여부 |
| Security | 위협·통제·감사·알림 최소화, 재인증 조건 |
| QA | 정상·실패·거부·재시도·오프라인 Acceptance 증거 |
| 운영 | 관측성, 지원용 Correlation ID, Rollback/Feature Flag |

## 4. 의존성 및 중단 조건

- P0 보안 Gate 미통과 시 P1 기능의 실제 영상 접근을 활성화하지 않는다.
- API·DB 변경이 승인 기준선에 반영되지 않으면 Mock/Prototype 상태를 벗어나지 않는다.
- 법적 권한 모델이 확정되지 않으면 가족 위임은 화면 Demo만으로도 운영 기능처럼 표현하지 않는다.
- 판독문·의뢰서의 출처·무결성·표준 Format이 결정되지 않으면 영상과 함께 임의 묶음으로 배포하지 않는다.
- 알림 공급자 장애가 접근 승인 또는 전송 결과 자체를 변경해서는 안 된다.

## 5. Release 판단

| 분류 | Release 조건 |
|---|---|
| `CAPSTONE-P1` | P0 PASS, 합성 데이터, Feature Flag, 관련 Acceptance 실행, 구현 기록 `TESTED` 이상 |
| `POST-MVP` | 별도 Scope Decision, 법적·표준 검토, 위협 모델 개정, 승인된 API/Data Contract |

## 6. 성공 지표

Capstone에서는 실제 환자 행동 분석 대신 합성 시나리오로 측정한다.

- 사용자가 다음 행동을 3단계 이내에 찾는다.
- 민감정보가 잠금화면·오류·지원 Bundle에 노출되지 않는다.
- 거부 원인과 안전한 다음 행동이 함께 제시된다.
- 서버 상태와 UI 상태가 불일치할 때 성공으로 오인하지 않는다.
- 핵심 흐름은 Screen Reader, 큰 글씨, 색상 외 상태표시로 수행 가능하다.

## 7. 변경 통제

본 로드맵은 구현 순서 제안이며 P0 Success Boundary를 변경하지 않는다. 분류 변경은 `CAPSTONE-MVP-BOUNDARY.md`, API 변경은 `OPENAPI.yaml`, 데이터 변경은 Domain/Data/ERD, 보안 변경은 Security Requirements와 Threat Model을 같은 Ticket에서 개정한다.
