# MediQ SaaS UI Design System

**Project:** MediQ  
**Document ID:** MEDIQ-SAAS-UI-DS-001  
**Version:** 0.2.0  
**Classification:** MIXED — CAPSTONE-P0 / CAPSTONE-P1 / POST-MVP  
**Status:** Proposed Design System — Not an Approved Product Baseline  
**Implementation:** NOT IMPLEMENTED  
**Test Status:** NOT RUN  
**Last Updated:** 2026-09-27

---

# 1. 목적

본 문서는 MediQ Hospital Portal, Synthetic Patient Web, QR Hospital Web 및 Platform Administration의 공통 시각 언어와 Component 계약을 정의한다. `SAAS-SCREEN-DESIGN-SPEC.md`의 화면 계약을 보조하며 Requirements, Security, OpenAPI 또는 Domain 기준을 변경하지 않는다.

Reference는 `SAAS-UI-REFERENCE-RESEARCH.md`와 `SAAS-UI-REFERENCE-MATRIX.md`의 구조적 패턴만 사용한다. 외부 제품의 화면, icon, 문구, 색상 또는 layout을 복제하지 않는다.

# 2. 설계 원칙

1. **Verified Context First:** Tenant, Hospital, Actor, Test 환경을 작업보다 먼저 확인할 수 있어야 한다.
2. **Server State Is Truth:** UI는 Consent, Grant, Transfer 또는 Verification 상태를 추론하지 않는다.
3. **Distinct Security States:** Consent, Authorization, Grant, QR Claim, Viewer Session, PACS Import를 하나의 성공 상태로 합치지 않는다.
4. **Fail Closed Visually:** `UNKNOWN`, `EXPIRED`, `REVOKED`, `DENIED`, `INTEGRITY_FAILED`에 성공 CTA를 제공하지 않는다.
5. **Evidence Before Completion:** Destination Verification, Integrity, Provenance, Audit가 완료되기 전 완료 표현을 사용하지 않는다.
6. **Minimum Necessary Data:** 기본 화면에는 업무 수행에 필요한 최소 metadata만 표시한다.
7. **Accessible by Default:** 색상, pointer 또는 icon 하나에 의미를 의존하지 않는다.
8. **Desktop Clinical Workflow First:** Hospital Portal과 Viewer는 workstation 우선, Patient Web은 responsive 우선이다.
9. **No False Precision:** 측정 근거 없는 percent, ETA 또는 처리량을 표시하지 않는다.
10. **Reference, Not Replica:** 공개 사례는 문제 해결 방식만 참고한다.

# 3. Portal Visual Modes

| Mode | 적용 | 기본 Surface | 목적 |
|---|---|---|---|
| Clinical Light | Hospital Portal, Patient Web | 밝은 surface | 목록, 승인, 근거, form 가독성 |
| Viewer Dark | Cloud DICOM Viewer | 어두운 surface | Pixel 대비와 영상 조작 집중 |
| Operations Light | Admin Portal | 밝은 dense surface | 구성, health, evidence 비교 |

Viewer Dark는 별도 권한 경계가 아니다. 동일한 verified context와 session state를 상단에 유지한다.

# 4. Design Token 상태

아래 값은 `PROPOSED VALUE`다. 실제 React 적용 전 automated contrast test, 200% zoom, Windows high-contrast mode 및 실제 Hospital monitor 검증을 통과해야 `VALIDATED`로 승격한다.

## 4.1 Semantic Color

| Token | Proposed Value | 용도 | 금지 |
|---|---|---|---|
| `color-bg-canvas` | `#F5F7FA` | Portal 배경 | 상태 의미 부여 |
| `color-bg-surface` | `#FFFFFF` | Card/Table/Form | Viewer pixel 배경 |
| `color-bg-subtle` | `#EEF2F6` | 구획·read-only | disabled와 혼동 |
| `color-text-primary` | `#17202A` | 주요 text | dark viewer 직접 사용 |
| `color-text-secondary` | `#4B5B6B` | 설명·metadata | 중요 오류 text |
| `color-border-default` | `#C7D1DC` | 경계·table | focus ring 대체 |
| `color-primary` | `#0B5C8E` | Primary CTA·link | 모든 상태 badge |
| `color-primary-hover` | `#08476F` | Hover | selected row 배경 단독 사용 |
| `color-focus` | `#7B3FF2` | Focus visible | brand decoration |
| `color-info` | `#1769AA` | 정보 | success 의미 |
| `color-success` | `#1D6F42` | 검증된 성공 | STOW 2xx 단독 완료 |
| `color-warning` | `#9A5A00` | 주의·만료 임박 | deny/integrity fail |
| `color-danger` | `#B42318` | 거부·실패·위험 | 단순 validation hint |
| `color-unknown` | `#665C99` | `RESULT_UNKNOWN` | failed 또는 completed 대체 |
| `color-revoked` | `#7A3045` | 철회 | expired와 혼합 |
| `color-test-banner` | `#5A3A00` | Synthetic/Test banner text | production 상태 표시 |
| `color-test-banner-bg` | `#FFF3C4` | Synthetic/Test banner | 일반 warning과 동일 문구 |
| `color-viewer-canvas` | `#05080C` | Pixel viewport | page body text |
| `color-viewer-surface` | `#111821` | Viewer panel | Portal card |
| `color-viewer-text` | `#F2F5F7` | Viewer overlay | light surface |

색상은 상태를 보조할 뿐이다. 모든 상태에는 icon, text label과 설명을 함께 제공한다.

## 4.2 Typography

| Token | Size/Line Height | Weight | 용도 |
|---|---|---:|---|
| `type-page-title` | 28/36 px | 700 | Page title |
| `type-section-title` | 22/30 px | 700 | Section heading |
| `type-card-title` | 18/26 px | 600 | Card title |
| `type-body` | 16/24 px | 400 | 기본 본문·form |
| `type-body-strong` | 16/24 px | 600 | 주요 값·CTA |
| `type-table` | 14/20 px | 400 | dense table |
| `type-label` | 14/20 px | 600 | form label·status |
| `type-caption` | 12/18 px | 400 | 보조 설명; 핵심 정보 금지 |
| `type-reference` | 13/20 px | 500 mono | correlation/display ref |
| `type-viewer-overlay` | 13/18 px | 500 | session·frame 정보 |

- 기본 UI font는 플랫폼 가독성 우선 system sans-serif stack을 사용한다.
- DICOM UID, token, secret에는 monospace를 사용하지 않는다. 이 값은 기본 UI에 표시하지 않는다.
- 200% browser zoom에서 horizontal page scroll 없이 핵심 작업을 수행할 수 있어야 한다. Viewer canvas 예외는 panel collapse로 보완한다.

## 4.3 Spacing

8px base grid를 사용하고 작은 내부 정렬에만 4px를 허용한다.

| Token | Value | 예시 |
|---|---:|---|
| `space-0` | 0 | reset |
| `space-1` | 4 px | icon-label gap |
| `space-2` | 8 px | control 내부 간격 |
| `space-3` | 12 px | compact row |
| `space-4` | 16 px | form field·card 내부 |
| `space-5` | 24 px | card 간격 |
| `space-6` | 32 px | section 간격 |
| `space-8` | 48 px | major section |
| `space-10` | 64 px | page top/bottom |

## 4.4 Shape and Elevation

| Token | 값 | 용도 |
|---|---|---|
| `radius-control` | 6 px | input/button |
| `radius-card` | 10 px | card/panel |
| `radius-dialog` | 12 px | dialog |
| `border-default` | 1 px | 기본 경계 |
| `border-emphasis` | 2 px | selected/focus 보조 |
| `shadow-popover` | subtle | menu/popover |
| `shadow-dialog` | medium | modal |

Elevation만으로 중요한 경계를 표현하지 않는다. border와 heading을 함께 사용한다.

## 4.5 Motion

| Token | 값 | 용도 |
|---|---:|---|
| `motion-fast` | 120 ms | hover/focus |
| `motion-normal` | 200 ms | panel/dialog |
| `motion-slow` | 320 ms | route-level transition 최대 |

- `prefers-reduced-motion`에서 비필수 transition을 제거한다.
- 상태 polling 때 row 전체를 깜박이거나 자동 이동하지 않는다.
- Viewer frame 이동은 motion animation이 아니라 즉시 pixel 교체다.

# 5. Layout Grid

## 5.1 Breakpoints

| 이름 | 범위 | 기본 동작 |
|---|---|---|
| `xl` | 1440 px 이상 | Sidebar 240, 12-column, detail panel 병렬 |
| `lg` | 1024~1439 px | Sidebar 216, 12-column, 일부 panel 접기 |
| `md` | 768~1023 px | Sidebar drawer, 8-column, table 중요 열 축소 |
| `sm` | 767 px 이하 | 4-column, card stack, Patient Web 우선 |

Hospital Viewer의 진단용 사용은 보장하지 않는다. `sm`에서는 Viewer series panel을 drawer로 전환하고 필수 조작만 제공한다.

## 5.2 Shell Dimensions

| Region | Desktop | Tablet | Mobile |
|---|---:|---:|---:|
| Test Banner | 32 px min | 36 px | 40 px |
| Global Header | 64 px | 64 px | 56 px |
| Sidebar | 216~240 px | drawer | drawer |
| Content max | 1440 px | full | full |
| Page gutter | 32 px | 24 px | 16 px |
| Sticky action bar | 필요 시 72 px | 72 px | safe-area 포함 80 px |

# 6. Iconography and Labels

- Icon은 의미를 보조하고 text label을 대체하지 않는다.
- `Allowed`, `Denied`, `Expired`, `Revoked`, `Unknown`, `Integrity Failed`는 서로 다른 icon과 label을 사용한다.
- Viewer toolbar는 icon, tooltip, accessible name, shortcut를 함께 제공한다.
- 외부 제품 고유 icon을 복제하지 않고 도입할 icon library의 license를 구현 Ticket에서 확인한다.
- 의료적 의미가 불분명한 심장, 십자가, 응급 icon을 장식용으로 사용하지 않는다.

# 7. 공통 상태 언어

| Server State | 사용자 Label | Tone | CTA 규칙 |
|---|---|---|---|
| `PENDING` | 확인 대기 | Info | 안전한 취소/새로고침만 |
| `ACTIVE` | 유효 | Success | exact scope CTA만 |
| `ALLOW` | 허용됨 | Success | 해당 action만 |
| `DENY` | 허용되지 않음 | Danger | 권한 생성 없는 복구만 |
| `EXPIRED` | 유효시간 만료 | Warning | 새 요청/재인증 |
| `REVOKED` | 철회됨 | Danger | 재사용 금지 |
| `CONFLICT` | 다른 상태가 확인됨 | Warning | refresh/reconcile |
| `PACS_UNAVAILABLE` | 원본 시스템 연결 불가 | Danger | 서버가 허용한 retry |
| `INTEGRITY_FAILED` | 무결성 검증 실패 | Danger | 완료/재사용 금지 |
| `RESULT_UNKNOWN` | 결과 확인 필요 | Unknown | verify/reconcile; blind retry 금지 |
| `COMPLETED` | 완료 | Success | 모든 completion gate 충족 시만 |

`성공`, `완료`, `안전`, `검증됨`은 서버 증거가 있는 경우에만 사용한다.

# 8. Core Component Contracts

## 8.1 EnvironmentBanner

| 항목 | 계약 |
|---|---|
| 목적 | Synthetic/Test 환경을 모든 P0 화면에서 지속 표시 |
| Data | build environment + server environment assertion |
| 표시 | `Synthetic/Test Data Only · 실제 진료용이 아닙니다` |
| 접근성 | landmark 또는 첫 번째 읽기 가능한 status; 매 route마다 반복 announce 금지 |
| 금지 | 사용자 입력으로 숨김, production 안전성 표시 |
| Screens | 모든 P0, P1 Test 화면 |

## 8.2 VerifiedContextHeader

| 항목 | 계약 |
|---|---|
| 목적 | 현재 Tenant, Hospital, Actor를 지속 표시 |
| Data | verified claims/context API |
| 상태 | Loading, Active, Switching, Expired, Denied |
| 행동 | Context switch 진입, 재인증 |
| 보안 | 입력 가능한 Tenant/Hospital ID 금지; switch 후 cache clear |
| Screens | 003 이후 protected screens |

## 8.3 ContextSwitcher

- 접근 가능한 서버 검증 context만 표시한다.
- 선택 전 현재 작업·미저장 입력·Viewer 종료 영향을 설명한다.
- 전환 중 모든 protected CTA를 disable한다.
- 완료 후 이전 context의 query, selected row, cached metadata와 viewer frame을 제거한다.
- `Context 선택 = 권한 부여` 문구를 사용하지 않는다.

## 8.4 ServerStateBadge

- badge는 서버가 반환한 canonical state를 표시한다.
- hover tooltip에 상태 의미와 마지막 확인 시각을 제공한다.
- client timeout에서 canonical state를 임의 변경하지 않는다.
- badge만으로 CTA enable 여부를 결정하지 않고 authorization response를 사용한다.

## 8.5 ConsentStatusCard

| Region | 내용 |
|---|---|
| Header | Consent state, version, expiry |
| Parties | patient reference, source, destination 최소표시 |
| Scope | Study/resource, action, purpose |
| Evidence | approved/withdrawn timestamp, actor category |
| CTA | request, approve, withdraw 중 server-allowed action |
| 금지 | Grant 상태와 합치기, 법적 효력 완료 주장 |

## 8.6 AuthorizationDecisionCard

- `ALLOW`, `DENY`, `UNKNOWN`을 구분한다.
- 세부 policy rule이나 공격 탐지 로직은 표시하지 않는다.
- `UNKNOWN`은 `ALLOW`가 아니다.
- decision time과 correlation reference를 제공한다.

## 8.7 TransferGrantCard

| 필드 | 표시 규칙 |
|---|---|
| Action | `VIEW`, `DOWNLOAD`, `PACS_IMPORT`, `MOBILE_EXPORT` 중 정확히 하나 |
| Recipient | 검증된 actor/hospital display name |
| Resource | Study display reference; raw UID 기본 숨김 |
| Expiry | 절대시각 + 이해 가능한 남은 시간 |
| State | ACTIVE/EXPIRED/REVOKED/CONSUMED |
| CTA | exact action 또는 revoke; scope 확대 금지 |

## 8.8 ExchangeTimeline

- lane은 Exchange, Consent, Authorization/Grant, Imaging/Transfer, Evidence로 분리한다.
- event는 timestamp, safe actor label, action, outcome과 correlation을 표시한다.
- timeline 순서를 상태 머신 전이 증거로 사용하되 client가 누락 event를 보완 생성하지 않는다.
- 모바일에서는 lane을 section으로 stack한다.

## 8.9 StudyTable

| 기본 열 | 규칙 |
|---|---|
| Study alias | Test display reference |
| Study date | locale + timezone 명시 |
| Modality | CT/MR 등 verified metadata |
| Description | 길이·control character 제한 |
| Series/Instance count | 제공되는 경우만 |
| Source | current exchange source display |
| Action | detail 진입; direct view/download 금지 |

Patient Name, MRN, Accession tenant-wide filter는 P0에서 제공하지 않는다. filter는 권한이 아니다.

## 8.10 SeriesNavigator

- Viewer Session이 활성인 동안만 metadata/thumbnail을 요청한다.
- selected series와 instance 위치를 text로 제공한다.
- keyboard 이전/다음, Home/End 후보를 제공한다.
- thumbnail cache는 session 종료 시 폐기한다.

## 8.11 ViewerSessionHeader

- Source Hospital, Study alias, Viewer Session 상태, expiry, close action을 표시한다.
- DICOM UID와 PACS URL을 표시하지 않는다.
- expiry warning은 5분/1분 후보이나 `PROPOSED VALUE`로 유지한다.
- session 만료 또는 revoke 시 새 frame 요청을 중지하고 viewport를 privacy overlay로 덮는다.

## 8.12 ViewerToolbar

P0 기본 도구:

- Window/Level
- Zoom in/out
- Pan
- Previous/Next image
- Stack scroll
- Reset
- Fullscreen
- Close Viewer

Measurement, annotation, segmentation, export, print, share는 승인 Requirement 없이는 추가하지 않는다.

## 8.13 PreflightChecklist

최소 항목:

1. Tenant isolation
2. Exchange state
3. Source binding
4. Destination binding
5. Patient mapping
6. Consent
7. Authorization decision
8. Transfer Grant action/scope/recipient/expiry
9. Study scope
10. Source retrieval readiness
11. Integrity/provenance context
12. Destination capability

각 check는 `CHECKING`, `PASS`, `DENY`, `UNKNOWN` 중 하나다. 전체가 `PASS`일 때만 최종 확인 CTA를 제공한다.

## 8.14 TransferStepper

- `Preflight → Retrieve → Package → STOW → Verify → Integrity → Provenance/Audit` 순서를 유지한다.
- 현재 단계, 완료된 단계, 실패/unknown 단계를 text로 표시한다.
- 실제 total bytes/instances가 있을 때만 percent를 사용한다.
- 새로고침 후 operation resource가 없으면 성공으로 복구하지 않고 API GAP을 표시한다.

## 8.15 ResultUnknownPanel

| 표시 | 내용 |
|---|---|
| Title | `전송 결과를 확인하고 있습니다` |
| Cause | 응답 유실/timeout 등 안전한 범주 |
| Evidence | 마지막 확인 시각, operation/correlation display reference |
| CTA | 상태 다시 확인, 지원 요청 |
| 금지 | 전체 재전송, 완료/실패 단정 |

## 8.16 DestinationVerificationCard

- Destination Hospital display name
- expected Study/instance summary
- observed Study/instance summary
- verification state와 timestamp
- mismatch 또는 missing instance 요약
- raw UID 전체 목록과 endpoint는 기본 화면에 표시하지 않는다.

## 8.17 IntegrityEvidenceCard

- state: `PENDING`, `VERIFIED`, `FAILED`
- algorithm identifier/version
- expected/observed object count
- evidence timestamp
- hash 원문은 기본 UI에서 숨기고 privileged evidence API가 승인된 경우에만 제한 표시한다.
- `FAILED` 또는 `PENDING`에서 완료 CTA를 제공하지 않는다.

## 8.18 ProvenanceGraph

P0 기본 node:

```text
Source PACS → MediQ Retrieval/Package → Destination PACS
```

- 최대 3~5개 node로 시작한다.
- 선택 node에 safe metadata와 timestamp를 표시한다.
- Patient/UID/object URL/credential을 node label에 포함하지 않는다.

## 8.19 AuditEventTable

기본 열:

- Timestamp
- Actor category/display reference
- Tenant/Hospital context
- Action
- Resource reference
- Outcome
- Correlation reference

raw payload, token, DICOM metadata와 stack을 표시하지 않는다. Export는 POST-MVP dedicated role 전까지 숨긴다.

## 8.20 CorrelationErrorPanel

- 안전한 오류 제목과 사용자 영향
- retryable 여부
- correlation reference와 timestamp
- 이전 화면/재시도/지원 CTA
- endpoint, policy rule, stack, token을 표시하지 않는다.

## 8.21 QRScannerPanel

- 현재 Hospital과 Actor를 고정 표시한다.
- camera permission 목적과 frame 무저장 원칙을 설명한다.
- allowlisted origin/path/length/alphabet 검증 중에는 PHI를 표시하지 않는다.
- third-party QR analytics SDK를 사용하지 않는다.

## 8.22 PairingReference

- 두 기기에서 비교할 수 있는 짧은 display reference다.
- QR payload나 credential이 아니다.
- screen reader가 문자군을 명확히 읽도록 grouping한다.
- clipboard copy는 기본 제공하지 않는다.

## 8.23 PatientApprovalWaitingPanel

- Hospital Web에는 요청 병원/actor display reference, action, countdown만 표시한다.
- 환자명, source, Study UID, thumbnail은 Grant 발급 전 표시하지 않는다.
- polling/SSE 연결 실패와 patient rejection을 다른 상태로 표시한다.

## 8.24 DangerousActionDialog

적용: Consent withdraw, Grant revoke, PACS Import final confirm, Connector/Policy 변경.

- 영향 대상, action, destination, irreversibility 또는 복구 한계를 재표시한다.
- 위험 action은 명시적 button label을 사용한다.
- focus는 정책에 따라 취소 또는 dialog heading에서 시작하며 keyboard escape 정책을 명시한다.
- double submit을 막되 timeout을 성공으로 처리하지 않는다.

## 8.25 ConnectorHealthCard

- Connector display name/ID
- Hospital/Tenant binding
- Health: active/degraded/inactive/unknown
- Last heartbeat/check
- Version/capability
- safe next action

`Healthy`는 Network, PACS auth, DICOMweb, Consent 또는 E2E 전체 PASS를 의미하지 않는다.

## 8.26 CertificateExpiryCard

- Subject display name
- Issuer
- 일부 fingerprint
- Valid from/to
- Active/Next/Retiring/Revoked
- rotation status와 audit link

Private key, password, complete secret material을 표시하지 않는다.

## 8.27 IncidentImpactPanel

- severity, status, start/update time
- affected tenant/hospital/service category
- Hospital User용 safe message
- Operator용 detail link
- recommended action

외부 service outage와 Hospital PACS/Connector 장애를 같은 status로 합치지 않는다.

## 8.28 ScopeBadge

- Resource와 action scope를 짧은 text로 표시한다.
- `study:view`, `study:download`, `study:pacs-transfer`, `study:mobile-export`를 서로 다른 label로 유지한다.
- 색상이나 icon만으로 action 차이를 표현하지 않는다.
- badge를 클릭하여 권한이 확대되거나 role이 변경되는 상호작용을 제공하지 않는다.

## 8.29 GrantActionBadge

- Transfer Grant의 canonical action 하나만 표시한다.
- `VIEW`, `DOWNLOAD`, `PACS_IMPORT`, `MOBILE_EXPORT`의 사용자용 label과 표준 scope를 병기한다.
- `ACTIVE` 같은 lifecycle state는 별도 `ServerStateBadge`로 표시한다.
- 여러 action을 `전체 권한` badge로 합치지 않는다.

## 8.30 SessionCountdown

- 서버의 절대 expiry를 기준으로 남은 시간을 표시한다.
- client clock 차이 또는 연결 실패에서 session 연장을 추론하지 않는다.
- 5분·1분·만료 알림은 `PROPOSED VALUE`이며 API 정책과 접근성 검증 후 확정한다.
- 0에서 보호된 CTA와 frame 요청을 중지하고 expiry state로 전환한다.

## 8.31 EmptyState

- `결과 없음`, `아직 생성되지 않음`, `필터 결과 없음`, `권한으로 숨겨짐`을 서로 다른 의미로 사용한다.
- 사용자가 수행할 수 있는 안전한 다음 행동만 제공한다.
- 빈 목록을 loading, denied 또는 upstream failure로 대체 표시하지 않는다.

## 8.32 AccessDeniedState

- 존재정보를 최소화한 제목, 안전한 사유 범주, correlation reference와 이전 경로를 제공한다.
- retry button이 권한을 만들지 않으며 동일 요청의 반복을 유도하지 않는다.
- 다른 Tenant, Patient, Study 또는 Hospital의 존재를 유추할 수 있는 세부정보를 표시하지 않는다.

## 8.33 PacsUnavailableState

- Source 또는 Destination의 안전한 display name, 영향받은 작업, 마지막 확인 시각과 retryability를 표시한다.
- PACS endpoint, network address, credential 또는 stack을 표시하지 않는다.
- Permanent Cloud copy나 다른 권한 scope를 fallback으로 제안하지 않는다.
- 서버가 허용한 bounded retry 또는 지원 경로만 제공한다.

# 9. Form Contracts

| 규칙 | 계약 |
|---|---|
| Label | placeholder가 label을 대체하지 않음 |
| Required | text와 programmatic indication |
| Validation | field 인접 + summary; 민감값 반사 금지 |
| Submit | 서버 응답 전 중복 제출 방지 |
| Timeout | 성공/실패 추정 금지 |
| Read-only | disabled와 시각·semantic 구분 |
| Confirmation | 위험 action에 영향 요약 |
| Autofill | token/secret/Patient ID에 부적절한 browser autofill 금지 |

# 10. Table Contracts

- caption과 column header association을 제공한다.
- server pagination과 filter 상태를 URL에 넣을 때 민감 식별자를 제외한다.
- row action은 menu 또는 detail 진입으로 제공하고 권한 없는 action을 단순 CSS hide만 하지 않는다.
- empty, loading, partial error, stale 상태를 구분한다.
- mobile에서는 key-value card로 변환하거나 중요 열을 유지한 horizontal region을 제공한다.
- 선택된 row는 색상 외 border/icon/text로 표시한다.

# 11. Dialog and Drawer Contracts

- `aria-modal`, accessible name, focus trap, focus return을 제공한다.
- route 이동 또는 session expiry 시 민감 dialog를 닫고 내용을 제거한다.
- destructive confirmation에 generic `확인` 대신 구체적 action label을 사용한다.
- detail drawer가 URL history에 영향을 주면 민감 ID를 그대로 노출하지 않는다.

# 12. Error and Recovery Language

| 상황 | 사용자 메시지 방향 | 허용 CTA |
|---|---|---|
| Authentication expired | 다시 인증 필요 | 로그인 |
| Access denied | 현재 권한으로 수행 불가 | 안전한 이전 화면 |
| Consent expired | 새 동의 요청 필요 | 요청 시작 |
| Grant revoked | 권한 철회됨 | 새 승인 경로 |
| PACS unavailable | 원본 시스템 연결 불가 | 허용된 재시도/지원 |
| Integrity failed | 완료 처리되지 않음 | evidence/지원 |
| Result unknown | 결과 확인 중 | 상태 재확인/지원 |
| Cross-tenant denied | 접근할 수 없음 | 현재 context 확인 |

다른 Tenant, Patient, Study 또는 endpoint의 존재를 유추할 수 있는 메시지를 사용하지 않는다.

# 13. Accessibility Contract

## 13.1 Keyboard

- Skip link: Global nav, Main content, Viewer tools.
- 논리적 DOM/focus order를 시각 순서와 일치시킨다.
- drag-only interaction을 금지한다.
- Viewer에 tool 선택과 previous/next의 keyboard 대체를 제공한다.
- `Escape` 동작이 data loss 또는 session close를 유발하면 확인한다.

## 13.2 Screen Reader

- route 이동 후 page title/heading에 focus 또는 announcement를 제공한다.
- 일반 상태는 `aria-live="polite"`, 즉시 차단은 제한적으로 `assertive`를 사용한다.
- countdown은 5분, 1분, 만료처럼 의미 있는 시점만 알린다.
- progress step은 현재 위치와 전체 step 수를 text로 제공한다.
- graph는 동등한 ordered list/table을 제공한다.

## 13.3 Visual

- 일반 text 4.5:1, large text와 UI component 3:1을 목표로 검증한다.
- focus indicator는 인접 색 대비 3:1을 목표로 한다.
- 200% zoom, reflow, text spacing override를 시험한다.
- Viewer pixel 자체는 의료영상 콘텐츠로 취급하되 주변 control은 동일 기준을 따른다.

# 14. Responsive Contracts

| Component | xl/lg | md | sm |
|---|---|---|---|
| Context Header | 한 줄 | wrap 허용 | summary + drawer |
| SideNav | 고정 | drawer | drawer |
| Exchange Timeline | multi-lane | 2-column | stacked sections |
| Study Table | 전체 열 | 중요 열+drawer | card list |
| Viewer | 3-panel | series drawer | 제한 UI+drawer |
| Preflight | 2-column checks | 1-column | 1-column sticky action |
| Transfer Stepper | horizontal/vertical 선택 | vertical | vertical |
| Audit Table | table | reduced table | activity cards |
| Provenance | graph+table | graph+table | ordered list 기본 |
| Admin Form | 2-column | 1-column | read-only 제한 후보 |

# 15. Telemetry and Audit Boundary

Client telemetry에 다음을 넣지 않는다.

- Patient name/local ID
- Study/Series/SOP UID
- raw QR payload
- Viewer URL/session token
- DICOM metadata/pixel
- PACS endpoint/credential
- Consent/Grant token material

허용 후보:

- Screen ID
- component/action name
- outcome category
- safe error category
- timing bucket
- correlation reference의 비가역·비민감 형태

Server Audit는 승인된 Audit 계약을 따르며 client analytics를 증거 원장으로 사용하지 않는다.

# 16. Component Traceability Summary

| Component | 주요 Screen | Primary Reference | Decision |
|---|---|---|---|
| VerifiedContextHeader | 003, protected 전체 | REF-SAA-01 | ADOPT |
| ExchangeTimeline | 012, 015 | REF-SAA-04/05 | ADAPT |
| StudyTable | 023 | REF-IMG-01 | ADAPT |
| ConsentStatusCard | 030~035 | REF-CON-01/02 | ADAPT |
| TransferGrantCard | 036~039 | REF-CON-02/03 | ADAPT |
| ViewerToolbar | 042~044 | REF-IMG-03/04 | ADOPT |
| SessionCountdown | 041, 045 | REF-QR-01/CON-01 | ADAPT |
| PreflightChecklist | 062 | REF-SAA-04 | ADAPT |
| TransferStepper | 065~070 | REF-SAA-04/05 | ADAPT |
| ResultUnknownPanel | 066, 070 | No suitable direct reference | MEDIQ UNIQUE |
| VerificationCard | 067 | No suitable direct reference | MEDIQ UNIQUE |
| IntegrityEvidenceCard | 068, 082 | REF-AUD-03 | ADAPT |
| ProvenanceGraph | 081 | REF-AUD-03 | ADAPT |
| AuditEventTable | 080, 083~085 | REF-AUD-01/02 | ADOPT |
| QRScannerPanel | QR-001~004 | REF-QR-03 | ADAPT |
| PatientApprovalWaitingPanel | QR-005 | REF-QR-01/CON-01 | ADAPT |
| ConnectorHealthCard | ADM-004/007/010 | REF-ADM-01/02 | ADOPT |
| CertificateExpiryCard | ADM-006 | REF-ADM-03 | ADOPT |
| IncidentImpactPanel | 006, ADM-010 | REF-ADM-04 | ADOPT |

# 17. Open Decisions

| ID | 항목 | Proposed Direction | 검증 |
|---|---|---|---|
| DS-OD-001 | 실제 font | System font 우선 | Korean/Windows rendering |
| DS-OD-002 | Hex palette | 본 문서 Proposed value | automated contrast |
| DS-OD-003 | Dark Viewer 경계 | Viewer canvas/panel만 dark | usability test |
| DS-OD-004 | Viewer expiry warning | 5분/1분 후보 | Session policy/API |
| DS-OD-005 | QR 수동 입력 | P1 후속 | brute-force/accessibility |
| DS-OD-006 | Tablet Hospital Portal | read/workflow 제한 후보 | device survey |
| DS-OD-007 | Dual monitor | Viewer detach 금지 기본 | security/usability |
| DS-OD-008 | Icon library | 미선정 | license/accessibility |

# 18. Validation Gate

다음 증거 전에는 Design System을 `VALIDATED`로 표시하지 않는다.

- Color contrast automated test
- Keyboard-only walkthrough
- Screen reader smoke test
- 200% zoom/reflow
- High contrast mode
- Viewer panel keyboard controls
- Sensitive data telemetry inspection
- Context switch cache purge test
- Session expiry privacy overlay test
- Component snapshot에 실제 PHI 없음

# 19. Status

| 항목 | 상태 |
|---|---|
| Token/Component contract | DOCUMENTED |
| Reference decision | DOCUMENTED |
| React component library | NOT IMPLEMENTED |
| Storybook | NOT IMPLEMENTED |
| Visual regression | NOT RUN |
| Accessibility audit | NOT RUN |
| Hospital usability test | NOT RUN |

본 문서는 UI 구현, 의료기기 인증, 접근성 적합성 또는 보안 PASS의 증거가 아니다.

# 20. Hospital Clinical Workflow P1 Components

| Component | 목적 | 필수 상태·보호 |
|---|---|---|
| `AuthorizedPriorStudyTable` | 권한 범위 후보 선택 | Partial authorization, Empty, Denied, Expired |
| `ComparisonViewportGrid` | 승인 Study Side-by-side | Viewport별 expiry/revoke, 허용 UID 집합 |
| `HandoffPacketCard` | 목적·Resource·Scope·만료 요약 | 문서권한 분리, no payload/export |
| `WorkAssignmentPanel` | 담당자·Queue·기한·상태 전이 | role guard, stateVersion conflict |
| `PrivacySafeInboxItem` | 최소정보 병원 알림 | no PHI preview, open-time reauthorization |
| `ExplainableAuditTimeline` | 원장 기반 단계 설명 | source sequence, RESULT_UNKNOWN, role redaction |

공통 Component는 색상만으로 권한·성공을 표현하지 않는다. Status Label, Icon, 설명문, 만료시각과 안전한 다음 행동을 함께 제공한다. Assignment와 Notification Component는 어떤 경우에도 Authorization Badge 또는 Grant 발급 UI를 포함하지 않는다.
