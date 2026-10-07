# MediQ SaaS UI Wireframe Pack

**Project:** MediQ  
**Document ID:** MEDIQ-SAAS-UI-WF-001  
**Version:** 0.2.0  
**Classification:** MIXED — CAPSTONE-P0 / CAPSTONE-P1 / POST-MVP  
**Status:** Reference-Driven Low-Fidelity Wireframes  
**Implementation:** NOT IMPLEMENTED  
**Test Status:** NOT RUN  
**Last Updated:** 2026-09-27  
**Parent:** `SAAS-SCREEN-DESIGN-SPEC.md`

---

# 1. 사용 목적

본 문서는 기존 핵심 42개 화면과 Hospital Clinical Workflow P1 Extension 5개 화면의 정보 우선순위와 상태·CTA 배치를 정의한다. 시각 디자인 원본이나 Figma 산출물이 아니며 실제 pixel, 색상, icon과 문구는 `SAAS-UI-DESIGN-SYSTEM.md`와 사용자 검증을 거쳐 구현한다.

모든 Wireframe의 공통 상단에는 `Synthetic/Test Data Only`, verified Tenant/Hospital/Actor가 표시된다. UID, PACS endpoint, credential, token, raw QR와 실제 PHI는 표시하지 않는다.

# 2. 표기

| 표기 | 의미 |
|---|---|
| `[Primary]` | 현재 server state와 authorization이 허용하는 주 행동 |
| `[Secondary]` | 안전한 보조 행동 |
| `[Disabled]` | 사유가 설명된 비활성 행동 |
| `!` | 주의·거부·실패; 색상 외 text/icon 필요 |
| `…` | loading/pending; success 추정 금지 |
| `?` | `RESULT_UNKNOWN`; verification 필요 |

# 3. 공통 Desktop Shell

```text
┌─────────────────────────────────────────────────────────────────────┐
│ SYNTHETIC / TEST DATA ONLY                                          │
├────────────┬──────────────────────────────────────┬─────────────────┤
│ MediQ      │ Breadcrumb · Page title              │ Tenant/Hospital │
│ Side Nav   │ Main                                 │ Actor / Session │
│            │                                      │                 │
└────────────┴──────────────────────────────────────┴─────────────────┘
```

Responsive: `md` 이하에서 Side Nav는 drawer, context는 compact summary+drawer로 전환한다. Context를 숨기지 않는다.

# 4. P0 핵심 Wireframes

## WF-R-001 — SAAS-SCR-003 역할·병원 Context

```text
┌ 역할과 병원 선택 ──────────────────────────────────────────────────┐
│ 로그인한 사용자: TEST-CLINICIAN-01                                 │
│ 접근 가능한 Context                                                │
│ ( ) Hospital A · HOSPITAL_USER · Tenant Test-Alpha                 │
│ ( ) Hospital B · HOSPITAL_USER · Tenant Test-Beta                  │
│ ! Context 변경 시 이전 조회·선택·Viewer 상태가 제거됩니다.          │
│                                      [취소] [선택한 Context로 계속] │
└─────────────────────────────────────────────────────────────────────┘
```

- State: Loading/Empty/Denied/Active/Switching.
- Mobile: context card stack; 임의 ID 입력 없음.
- Reference: REF-SAA-01 `ADOPT`, REF-SAA-02 `ADAPT`.

## WF-R-002 — SAAS-SCR-010 Hospital Dashboard

```text
┌ Hospital A Dashboard ───────────────────────────────────────────────┐
│ [새 Exchange] [Exchange ID로 열기]                                  │
├ 진행 중 ───────────────┬ 동의 대기 ────────────┬ 확인 필요 ─────────┤
│ EX-… · 전송 VERIFYING   │ 2건 · server count   │ RESULT_UNKNOWN 1건 │
├ 최근 작업 ─────────────────────────────────────────────────────────┤
│ 상태 | Display Ref | Action | Updated | [상세]                       │
└─────────────────────────────────────────────────────────────────────┘
```

- API에 summary가 없으면 card를 숨기고 `Exchange ID로 열기`만 제공한다.
- 가짜 통계나 client aggregate 금지.
- Reference: REF-SAA-05/04 `ADAPT`.

## WF-R-003 — SAAS-SCR-012 Exchange 상세

```text
┌ Exchange EX-TEST-1042 · ACTIVE ─────────────────────────────────────┐
│ Source Hospital A → Destination Hospital B · expires 14:30          │
├ Patient Mapping ────────┬ Consent ───────────┬ Authorization ──────┤
│ VALID                   │ ACTIVE v3          │ ALLOW                │
├ Transfer Grant ─────────┴────────────────────┴──────────────────────┤
│ PACS_IMPORT · Hospital B · 14:20 만료  [Grant 상세]                 │
├ Study / Actions ────────────────────────────────────────────────────┤
│ TEST-STUDY-CT-01 [상세] [Viewer] [Download] [PACS Import]            │
└─────────────────────────────────────────────────────────────────────┘
```

- 각 card는 독립 server state다. 하나의 `승인됨` badge로 합치지 않는다.
- CTA는 exact Grant scope별로 활성화한다.
- Reference: REF-SAA-04/05 `ADAPT`, MediQ unique cards.

## WF-R-004 — SAAS-SCR-015 Exchange Timeline

```text
┌ Exchange Timeline ──────────────────────────────────────────────────┐
│ Exchange       ● Created ─ ● Mapping Valid ─ ● Active               │
│ Consent        ● Requested ─ ● Approved v3                           │
│ Auth/Grant     ● Allow ─ ● PACS_IMPORT Grant                         │
│ Transfer       ● Preflight ─ ◉ STOW ─ ○ Verify ─ ○ Integrity        │
│ Evidence       ○ Provenance ─ ○ Audit completion                     │
│ [Event table 보기]                                                   │
└─────────────────────────────────────────────────────────────────────┘
```

- Responsive: lane을 heading별 ordered list로 stack한다.
- 누락 event를 client가 추론해 생성하지 않는다.
- Reference: REF-SAA-04/05, REF-AUD-01 `ADAPT`.

## WF-R-005 — SAAS-SCR-023 Study 목록

```text
┌ 승인된 Study ───────────────────────────────────────────────────────┐
│ 기간 [____] Modality [CT▼] 설명 [________] [조회]                    │
│ Study alias       Date       Modality  Series  Instances  Action    │
│ TEST-CT-0001      2026-09-20 CT        3       180        [상세]    │
│ TEST-MR-0002      2026-09-18 MR        5       240        [상세]    │
│ 1–2 / 2                                         [이전] [다음]       │
└─────────────────────────────────────────────────────────────────────┘
```

- PatientName/MRN/Accession 전체검색 없음.
- UID 기본 숨김; filter는 권한이 아니다.
- Reference: REF-IMG-01 `ADAPT`, REF-IMG-05 `STUDY ONLY`.

## WF-R-006 — SAAS-SCR-024 Study 상세

```text
┌ TEST-CT-0001 ───────────────────────────────────────────────────────┐
│ Source Hospital A · CT · 2026-09-20 · Series 3 · Instance 180      │
├ Series Summary ───────────────────────┬ 허용된 작업 ────────────────┤
│ 1 Scout · 2 instances                 │ [Cloud Viewer]              │
│ 2 Axial · 176 instances               │ [DICOM Download]            │
│ 3 Reformatted · 2 instances           │ [PACS Import]               │
│                                       │ 각 action별 Grant 표시       │
└───────────────────────────────────────┴─────────────────────────────┘
```

- Pixel preview는 Viewer Session 전 표시하지 않는다.
- Action card는 독립 scope와 expiry를 표시한다.
- Reference: REF-IMG-01/02 `ADAPT`.

## WF-R-007 — SAAS-SCR-030 Consent 요청

```text
┌ 환자 동의 요청 ─────────────────────────────────────────────────────┐
│ Patient Ref   TEST-PATIENT-004                                     │
│ Source        Hospital A                                           │
│ Destination   Hospital B                                           │
│ Study         TEST-CT-0001                                         │
│ Action        PACS_IMPORT                                           │
│ Purpose       진료 연계 테스트                                      │
│ Expiry        2026-09-24 14:30 KST                                 │
│ ! 이 요청은 동의 완료 또는 Grant 발급이 아닙니다.                    │
│                                    [취소] [동의 요청 보내기]         │
└─────────────────────────────────────────────────────────────────────┘
```

- Server-derived source/destination은 read-only다.
- Reference: REF-CON-02/01 `ADAPT`.

## WF-R-008 — SAAS-SCR-031 Consent 상태

```text
┌ Consent v3 · ACTIVE ────────────────────────────────────────────────┐
│ Scope: TEST-CT-0001 · PACS_IMPORT · Hospital B                     │
│ Purpose: 진료 연계 테스트 · Expires: 14:30                         │
│ Approved: Synthetic Patient · 13:42                                │
│ Authorization: 별도 ALLOW 필요                                     │
│ Transfer Grant: 별도 발급 필요                                     │
│ [Consent 상세] [철회]                                               │
└─────────────────────────────────────────────────────────────────────┘
```

- PENDING/EXPIRED/WITHDRAWN/REJECTED는 같은 자리에서 다른 CTA를 제공한다.
- Reference: REF-CON-02/04 `ADAPT`.

## WF-R-009 — SAAS-SCR-032 Patient Consent 확인

```text
┌ 의료영상 사용 요청을 확인하세요 ───────────────────────────────────┐
│ 제공: Hospital A     요청: Hospital B                              │
│ 영상: TEST-CT-0001 · CT · 2026-09-20                               │
│ 요청 작업: Hospital B PACS로 반입                                  │
│ 목적: 진료 연계 테스트       유효시간: 48분                         │
│ Consent version: v3                                             │
│ [나중에]                                         [내용 확인 완료]   │
└─────────────────────────────────────────────────────────────────────┘
```

- 모바일 web에서는 summary 뒤 sticky CTA.
- 실제 법적 동의 완료로 표현하지 않는다.
- Reference: REF-CON-01/04 `ADAPT`.

## WF-R-010 — SAAS-SCR-033 Patient Consent 승인

```text
┌ 동의 제출 ──────────────────────────────────────────────────────────┐
│ 위 범위와 목적에 대해 기술적 동의를 기록합니다.                     │
│ □ 제공·요청 병원, Study, Action, Purpose를 확인했습니다.            │
│ ! 동의 후에도 시스템 인가와 Transfer Grant가 별도로 필요합니다.     │
│                                  [취소] [이 범위에 동의]             │
└─────────────────────────────────────────────────────────────────────┘
```

- version conflict/expiry에서 submit 실패 후 새 내용을 다시 확인한다.
- Reference: REF-CON-02/04 `ADAPT`.

## WF-R-011 — SAAS-SCR-036 Transfer Grant 발급

```text
┌ Transfer Grant 발급 ────────────────────────────────────────────────┐
│ Consent ACTIVE v3   Authorization ALLOW                             │
│ Action       PACS_IMPORT                                            │
│ Recipient    Hospital B                                             │
│ Resource     TEST-CT-0001                                           │
│ Expires      20분 후                                                 │
│ ! VIEW/DOWNLOAD 권한은 포함되지 않습니다.                            │
│                                      [취소] [PACS_IMPORT Grant 발급] │
└─────────────────────────────────────────────────────────────────────┘
```

- Action 변경은 재평가를 요구한다.
- Reference: REF-CON-02/03 `ADAPT`.

## WF-R-012 — SAAS-SCR-037 Transfer Grant 상태

```text
┌ PACS_IMPORT Grant · ACTIVE ─────────────────────────────────────────┐
│ Recipient Hospital B · TEST-CT-0001 · expires 14:20                │
│ Bound Tenant/Patient/Study/Action: verified                         │
│ [Grant 철회]                                      [PACS Import 계속] │
└─────────────────────────────────────────────────────────────────────┘
```

- EXPIRED/REVOKED/CONSUMED에서 action CTA 제거.
- Reference: REF-QR-01, REF-CON-02 `ADAPT`.

## WF-R-013 — SAAS-SCR-042 Cloud DICOM Viewer

```text
┌ TEST | Hospital A | TEST-CT-0001 | Session 18:42 | [닫기] ─────────┐
├ Series ───────────┬───────────────────────────────┬ Status ─────────┤
│ 1 Scout           │                               │ Instance 42/176 │
│ 2 Axial ●         │          VIEWPORT             │ WADO: active    │
│ 3 Reformatted     │                               │ no-store        │
├───────────────────┴───────────────────────────────┴────────────────┤
│ [W/L] [Zoom−/+] [Pan] [Prev/Next] [Reset] [Fullscreen]             │
└─────────────────────────────────────────────────────────────────────┘
```

- Download/PACS Import button 없음.
- Session revoke/expiry 시 viewport를 즉시 privacy overlay로 대체한다.
- Reference: REF-IMG-03 `ADOPT`, REF-IMG-02/04/06 `ADAPT`.

## WF-R-014 — SAAS-SCR-045 Viewer Session 만료

```text
┌ Viewer Session 만료 ────────────────────────────────────────────────┐
│ [Pixel 영역을 불투명 privacy surface로 대체]                         │
│ 유효시간이 끝나 영상 요청과 표시를 중지했습니다.                    │
│ [Study 상세로 돌아가기]                         [새 Viewer 승인 요청]│
└─────────────────────────────────────────────────────────────────────┘
```

- stale frame, thumbnail, overlay metadata 제거.
- Reference: REF-QR-01/CON-01 `ADAPT`.

## WF-R-015 — SAAS-SCR-050 Download 확인

```text
┌ DICOM Download 확인 ────────────────────────────────────────────────┐
│ Study TEST-CT-0001 · Source Hospital A                              │
│ Permission study:download · expires 14:18                           │
│ ! 다운로드 파일은 승인된 Test 데이터이며 PACS 반입 완료가 아닙니다. │
│                                     [취소] [Download 시작]           │
└─────────────────────────────────────────────────────────────────────┘
```

- VIEW Grant만 있으면 CTA 비활성+사유 표시.
- Reference: REF-CON-02, REF-SAA-04 `ADAPT`.

## WF-R-016 — SAAS-SCR-051 Download 진행

```text
┌ Download 진행 ──────────────────────────────────────────────────────┐
│ TEST-CT-0001                                                        │
│ 받은 데이터 118 MiB / 총 크기 제공됨 240 MiB                        │
│ [█████████░░░░░░░] 49%                                              │
│ 또는: 총 크기 미제공 · 118 MiB 수신                                │
│ [닫기 비활성/설명]                                                   │
└─────────────────────────────────────────────────────────────────────┘
```

- 실제 byte 근거가 없으면 percent 없음.
- 연결 유실에서 자동 재요청하지 않는다.
- Reference: REF-SAA-05, REF-QR-01 `ADAPT`.

## WF-R-017 — SAAS-SCR-062 PACS Import Preflight

```text
┌ PACS Import Preflight ──────────────────────────────────────────────┐
│ ✓ Tenant isolation        ✓ Destination binding                    │
│ ✓ Exchange state          ✓ Patient mapping                         │
│ ✓ Consent                 ✓ Authorization                           │
│ ✓ Grant scope/recipient   ✓ Study scope                             │
│ ✓ Source readiness        … Destination capability                  │
│ ✓ Integrity context       ✓ Provenance context                      │
│ 상태: CHECKING                    [취소] [최종 확인 Disabled]        │
└─────────────────────────────────────────────────────────────────────┘
```

- DENY/UNKNOWN 하나라도 있으면 READY 아님.
- Reference: REF-SAA-04 `ADAPT`; checklist 내용은 MediQ unique.

## WF-R-018 — SAAS-SCR-063 PACS Import 최종 확인

```text
┌ Hospital B PACS 반입 최종 확인 ────────────────────────────────────┐
│ Source      Hospital A                                              │
│ Destination Hospital B (변경 불가)                                  │
│ Patient Mapping VALID                                               │
│ Study       TEST-CT-0001                                            │
│ Grant       PACS_IMPORT · 12분 남음                                 │
│ ! 반입 후 대상 PACS 사본은 해당 병원 정책을 따릅니다.               │
│                                  [취소] [Hospital B로 반입 시작]     │
└─────────────────────────────────────────────────────────────────────┘
```

- fresh Preflight snapshot이 아니면 다시 검사한다.
- Reference: REF-CON-02, REF-SAA-04 `ADAPT`.

## WF-R-019 — SAAS-SCR-065 전송 진행

```text
┌ PACS Import 진행 · OP-TEST-775 ────────────────────────────────────┐
│ ✓ Preflight                                                         │
│ ✓ Source Retrieval                                                  │
│ ✓ Package Preparation                                               │
│ ◉ Destination STOW                                                  │
│ ○ Destination Verification                                          │
│ ○ Integrity · Provenance · Audit                                    │
│ 마지막 확인 13:52:10 · [상태 새로고침]                              │
└─────────────────────────────────────────────────────────────────────┘
```

- 페이지 새로고침이 중복 STOW를 만들지 않아야 한다.
- durable operation API는 GAP로 표시한다.
- Reference: REF-SAA-04/05 `ADAPT`.

## WF-R-020 — SAAS-SCR-066 부분 성공·재시도 대기

```text
┌ ? 전송 결과 확인 필요 ──────────────────────────────────────────────┐
│ STOW 요청 후 응답을 확인하지 못했습니다.                            │
│ 확인된 사실: Source retrieval 완료 · 요청 전송됨                    │
│ 미확인: Destination 수신 instance 집합                              │
│ 다음 단계: Destination Verification                                │
│ [Exchange로 돌아가기] [수신 결과 확인] [전체 재전송 Disabled]       │
└─────────────────────────────────────────────────────────────────────┘
```

- `RESULT_UNKNOWN`은 failure나 completion이 아니다.
- Reference: 일반 workflow 사례를 변형; 핵심은 MediQ unique.

## WF-R-021 — SAAS-SCR-067 Destination Verification

```text
┌ Destination Verification ──────────────────────────────────────────┐
│ Destination Hospital B                                             │
│ Expected: Study 1 · Instances 180                                  │
│ Observed: Study 1 · Instances 180                                  │
│ Result: VERIFIED · 13:54:02                                        │
│ [Integrity 확인] [Evidence 상세]                                   │
└─────────────────────────────────────────────────────────────────────┘
```

- mismatch/pending에서 완료 화면으로 이동하지 않는다.
- Reference: REF-AUD-03/REF-SAA-04 `ADAPT`; completion gate는 MediQ unique.

## WF-R-022 — SAAS-SCR-068 Integrity 결과

```text
┌ Integrity Evidence ─────────────────────────────────────────────────┐
│ Result: VERIFIED                                                     │
│ Algorithm profile: SHA-256-v1                                       │
│ Expected/Observed object count: 180 / 180                            │
│ Evidence time: 13:54:20                                             │
│ [Provenance 보기] [Audit 보기] [완료 확인]                           │
└─────────────────────────────────────────────────────────────────────┘
```

- FAILED/PENDING이면 `[완료 확인]` 없음.
- raw hash 기본 숨김.
- Reference: REF-AUD-03 `ADAPT`.

## WF-R-023 — SAAS-SCR-069 PACS Import 완료

```text
┌ PACS Import 완료 ───────────────────────────────────────────────────┐
│ ✓ Destination Verified   ✓ Integrity Verified                       │
│ ✓ Provenance Created     ✓ Completion Audit Recorded                │
│ Hospital A → Hospital B · TEST-CT-0001 · 13:54:31                   │
│ [Audit Timeline] [Provenance] [Exchange 상세]                       │
└─────────────────────────────────────────────────────────────────────┘
```

- 네 completion gate 중 하나라도 없으면 이 화면을 표시하지 않는다.
- Reference: REF-SAA-04/AUD-01 `ADAPT`.

## WF-R-024 — SAAS-SCR-070 전송 실패·거부

```text
┌ ! PACS Import를 완료하지 못했습니다 ───────────────────────────────┐
│ Category: DESTINATION_MAPPING_INVALID                               │
│ 영상은 Destination PACS로 전송되지 않았습니다.                      │
│ Correlation: CORR-TEST-8F21 · 13:51:08                             │
│ [Mapping 확인] [Exchange 상세] [지원 정보]                          │
└─────────────────────────────────────────────────────────────────────┘
```

- 잘못된 destination, mapping, Consent, Grant, PACS, integrity를 안전한 범주로 구분한다.
- Reference: REF-SAA-04/ADM-04 `ADAPT`.

## WF-R-025 — SAAS-SCR-080 Audit Timeline

```text
┌ Exchange Audit ─────────────────────────────────────────────────────┐
│ Filter [Action▼] [Outcome▼] [Time range▼]                           │
│ Time      Actor          Action              Outcome  Correlation    │
│ 13:54:31 HOSPITAL_USER   PACS_IMPORT         SUCCESS  CORR-…         │
│ 13:54:20 SYSTEM          INTEGRITY_VERIFY    SUCCESS  CORR-…         │
│ 13:51:08 SYSTEM          PREFLIGHT           ALLOW    CORR-…         │
└─────────────────────────────────────────────────────────────────────┘
```

- raw payload/export는 P0에서 제공하지 않는다.
- Reference: REF-AUD-01 `ADOPT`, REF-AUD-02 `ADAPT`.

## WF-R-026 — SAAS-SCR-081 Provenance 상세

```text
┌ Provenance ─────────────────────────────────────────────────────────┐
│ [Hospital A PACS] → [MediQ Retrieval/Package] → [Hospital B PACS]  │
│       13:50                13:51–13:53               13:54          │
│ Selected node safe detail                                           │
│ Source/Process/Destination · Result · Evidence time                  │
│ [동등한 Table 보기]                                                  │
└─────────────────────────────────────────────────────────────────────┘
```

- graph는 3~5 node, screen reader용 ordered table 제공.
- Reference: REF-AUD-03 `ADAPT`.

# 5. P1 QR Hospital Web Wireframes

## WF-R-027 — SAAS-QR-001 Scanner 시작

```text
┌ QR Handoff Scanner ─────────────────────────────────────────────────┐
│ Hospital B · TEST-CLINICIAN-02                                     │
│ QR에는 의료영상이 없으며 환자가 별도로 확인·승인해야 합니다.        │
│ [카메라로 QR 스캔]                                                   │
└─────────────────────────────────────────────────────────────────────┘
```

- Reference: REF-QR-03 `ADAPT`.

## WF-R-028 — SAAS-QR-003 QR 검증

```text
┌ QR 확인 중 ─────────────────────────────────────────────────────────┐
│ … 허용된 Origin과 형식을 확인하고 있습니다.                         │
│ 환자·Study 정보는 아직 표시되지 않습니다.                           │
│ [취소]                                                               │
└─────────────────────────────────────────────────────────────────────┘
```

- malformed/expired/wrong origin은 generic reject.
- Reference: REF-QR-01/04 `ADAPT`.

## WF-R-029 — SAAS-QR-004 Claim 요청

```text
┌ 연결 요청 ──────────────────────────────────────────────────────────┐
│ 현재 병원 Hospital B · Actor TEST-CLINICIAN-02                     │
│ Pairing Ref: M7K2-P4                                                │
│ ! 연결 후에도 환자 승인 전 의료정보는 공개되지 않습니다.            │
│ [취소] [이 병원으로 연결 요청]                                      │
└─────────────────────────────────────────────────────────────────────┘
```

- hospital/actor를 request body에서 변경할 수 없음.
- Reference: REF-QR-01/02 `ADAPT`.

## WF-R-030 — SAAS-QR-005 환자 승인 대기

```text
┌ 환자 승인 대기 ─────────────────────────────────────────────────────┐
│ Hospital B · TEST-CLINICIAN-02 · Pairing M7K2-P4                   │
│ Requested action: PACS_IMPORT                                      │
│ 남은 시간 04:12                                                     │
│ … 환자가 병원과 요청 내용을 확인하고 있습니다.                     │
│ [대기 종료]                                                          │
└─────────────────────────────────────────────────────────────────────┘
```

- Patient/Study/source/thumbnail 없음.
- Reference: REF-QR-01/CON-01 `ADAPT`.

## WF-R-031 — SAAS-QR-007 중복 Claim·충돌

```text
┌ 연결할 수 없습니다 ─────────────────────────────────────────────────┐
│ 이 요청은 사용할 수 없거나 다른 세션에서 처리 중입니다.            │
│ 환자 또는 다른 병원의 정보는 표시되지 않습니다.                    │
│ [다시 스캔] [닫기]                                                   │
└─────────────────────────────────────────────────────────────────────┘
```

- Reference: REF-QR-01/03 `ADAPT`.

## WF-R-032 — SAAS-QR-008 VIEW Grant 준비

```text
┌ VIEW 권한 준비 완료 ────────────────────────────────────────────────┐
│ 환자가 Hospital B의 영상 열람을 승인했습니다.                       │
│ Grant: study:view · short-lived                                    │
│ [Exchange 상세] [Cloud Viewer 시작]                                 │
└─────────────────────────────────────────────────────────────────────┘
```

- 조회 완료가 아니라 Viewer 시작 가능 상태다.
- Reference: REF-QR-02/CON-02 `ADAPT`.

## WF-R-033 — SAAS-QR-009 PACS_IMPORT Grant 준비

```text
┌ PACS_IMPORT 권한 준비 완료 ─────────────────────────────────────────┐
│ Grant: study:pacs-transfer · Hospital B                             │
│ ! 반입 전 Patient Mapping과 Mandatory Preflight를 수행합니다.       │
│ [Exchange 상세] [Preflight 시작]                                    │
└─────────────────────────────────────────────────────────────────────┘
```

- PACS 저장 완료 표현 금지.
- Reference: REF-QR-02/SAA-04 `ADAPT`.

## WF-R-034 — SAAS-QR-010 Grant 실패

```text
┌ 권한을 준비하지 못했습니다 ─────────────────────────────────────────┐
│ 의료영상은 공유되거나 전송되지 않았습니다.                           │
│ Category: APPROVAL_EXPIRED · Correlation CORR-TEST-…                │
│ [새 요청 안내] [닫기]                                                │
└─────────────────────────────────────────────────────────────────────┘
```

- retry는 server가 retryable로 표시한 경우만.
- Reference: REF-QR-01/ADM-04 `ADAPT`.

# 6. POST-MVP / PRODUCTIONIZATION Admin Wireframes

## WF-R-035 — SAAS-ADM-001 Tenant 목록·상세

```text
┌ Platform Administration / Tenants ─────────────────────────────────┐
│ Search [____] Status [Active▼]                                      │
│ Tenant          Hospitals  Region  Policy version  Status  Action   │
│ Test-Alpha      2          KR      v4              Active  [상세]   │
│ [새 Tenant 등록 — 권한 필요]                                        │
└─────────────────────────────────────────────────────────────────────┘
```

- Hospital Portal과 별도 shell/RBAC.
- Reference: REF-SAA-02/03 `ADAPT`.

## WF-R-036 — SAAS-ADM-002 Hospital 등록·상태

```text
┌ Hospital B ─────────────────────────────────────────────────────────┐
│ Tenant Test-Beta · Onboarding IN_PROGRESS                           │
│ Identity ✓  Connector ?  DICOMweb capability ?  Trust review …     │
│ [Connector 구성] [Audit]                                            │
└─────────────────────────────────────────────────────────────────────┘
```

- credential 입력/표시 없음.
- Reference: REF-SAA-02, REF-ADM-01 `ADAPT`.

## WF-R-037 — SAAS-ADM-004 PACS Connector 등록

```text
┌ Connector 등록 ─────────────────────────────────────────────────────┐
│ Hospital Hospital B                                                 │
│ Connector display name [________]                                   │
│ Capability [QIDO] [WADO] [STOW]                                    │
│ Secret source: Managed Secret Reference (원문 비표시)                │
│ [취소] [등록 요청]                                                   │
└─────────────────────────────────────────────────────────────────────┘
```

- privileged approval와 audit 필요.
- Reference: REF-ADM-01/02 `ADOPT`.

## WF-R-038 — SAAS-ADM-005 DICOMweb Endpoint

```text
┌ DICOMweb Capability ────────────────────────────────────────────────┐
│ Connector CN-TEST-B-01                                             │
│ Endpoint reference EP-TEST-B-01 (URL 원문 기본 숨김)               │
│ QIDO ✓  WADO —  STOW ✓  Last verified 14:02                       │
│ TLS/mTLS: configured · Allowlist: verified                           │
│ [Capability 다시 검증]                                              │
└─────────────────────────────────────────────────────────────────────┘
```

- 자유 URL 입력과 browser direct test 금지.
- Reference: REF-IMG-06/ADM-01 `ADAPT`.

## WF-R-039 — SAAS-ADM-006 인증서·mTLS

```text
┌ Certificate Trust ──────────────────────────────────────────────────┐
│ Active cert   CN=connector-test-b · expires 2026-12-31             │
│ Fingerprint   A1:9C:…:7E                                            │
│ Next cert     Not staged                                            │
│ Status        Rotation recommended in 30 days                       │
│ [Rotation 계획] [Revoke 요청] [Audit]                               │
└─────────────────────────────────────────────────────────────────────┘
```

- private key와 full secret 비표시.
- Reference: REF-ADM-03/01 `ADOPT`.

## WF-R-040 — SAAS-ADM-007 Private Connectivity

```text
┌ Private Connectivity ───────────────────────────────────────────────┐
│ Network tunnel      HEALTHY · last heartbeat 14:05                  │
│ Connector service   ACTIVE                                          │
│ PACS capability     STOW DEGRADED                                   │
│ Application E2E     UNKNOWN                                         │
│ [진단 보기] [Incident 열기]                                         │
└─────────────────────────────────────────────────────────────────────┘
```

- 계층별 health를 합치지 않는다.
- Reference: REF-ADM-02/01 `ADOPT`.

## WF-R-041 — SAAS-ADM-009 Temporary Object·Purge

```text
┌ Temporary Object Lifecycle ─────────────────────────────────────────┐
│ Tenant/Session bound objects: 3                                     │
│ Oldest expiry: 14:12 · Purge queue: 1                               │
│ Object Ref      State       Expires      Purge evidence             │
│ TMP-TEST-101    PURGED      13:55        EVT-…                      │
│ [Evidence 상세]                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

- object URL, DICOM payload, key 비표시.
- Reference: REF-AUD-03/02 `ADAPT`.

## WF-R-042 — SAAS-ADM-010 Queue·Worker 상태

```text
┌ Operations / Jobs ──────────────────────────────────────────────────┐
│ Queue depth 4 · Active workers 2 · Incident 1                       │
│ Job Ref      Type         State           Age      Action           │
│ JOB-TEST-77  PACS_IMPORT  RESULT_UNKNOWN  04:12    [Reconcile]      │
│ JOB-TEST-78  PURGE        RUNNING         00:41    [상세]           │
└─────────────────────────────────────────────────────────────────────┘
```

- manual retry는 idempotency/destination verification 후 server action만.
- Reference: REF-SAA-05/ADM-04 `ADAPT`.

# 7. State Overlay Variants

모든 핵심 화면은 다음 overlay 또는 inline state를 갖는다.

| State | 표시 | CTA |
|---|---|---|
| Loading | 작업명+skeleton/spinner | 취소 가능한 작업만 취소 |
| Empty | 이유와 다음 안전한 행동 | 생성/필터 초기화 |
| Denied | 안전한 사유·correlation | 이전/context 확인 |
| Expired | 만료시각·영향 | 새 요청/재인증 |
| Revoked | 철회됨·재사용 불가 | 새 승인 |
| Conflict | server state 변경 | refresh/review |
| PACS unavailable | 영향범위 | bounded retry/support |
| Integrity failed | completion blocked | evidence/support |
| Result unknown | verify required | reconcile; blind retry 없음 |

# 8. Responsive Review

- `xl/lg`: 표와 detail panel을 병렬 배치할 수 있다.
- `md`: detail은 drawer 또는 다음 화면으로 이동한다.
- `sm`: Patient Web과 QR은 card stack+sticky action; Hospital dense tables는 핵심 열만 보여준다.
- Viewer는 `sm`에서 series/status를 drawer로 전환하고 toolbar를 overflow menu로 축약한다.
- Admin 설정은 `sm`에서 read-only로 제한할 수 있으며 제한 사유를 표시한다.

# 9. Coverage

| 범위 | Wireframe 수 | 상태 |
|---|---:|---|
| P0 핵심 | 26 | DOCUMENTED |
| P1 QR | 8 | DOCUMENTED |
| POST-MVP/PRODUCTIONIZATION Admin | 8 | DOCUMENTED |
| Hospital Clinical Workflow P1 Extension | 5 | DOCUMENTED |
| 합계 | 47 | DOCUMENTED |

나머지 화면은 `SAAS-SCREEN-DESIGN-SPEC.md`의 화면 계약과 본 문서의 공통 Shell·State·Component 규칙을 조합한다. Wireframe 작성 완료는 UI 구현 또는 사용자 검증 완료를 의미하지 않는다.

# 10. Hospital Clinical Workflow P1 Wireframes

## 10.1 HCW-SCR-001 — 관련 과거 영상

```text
┌ Hospital B · CLINICIAN · TEST DATA ───────────────┐
│ 현재 Study: CT · Chest · 2026-09-20               │
│ [기간] [Modality] [Body Part] [검색]               │
├────────────────────────────────────────────────────┤
│ □ 2026-06-12  CT  Chest  VIEW 허용 · 14분 남음    │
│ □ 2025-12-03  CT  Chest  권한 확인 필요            │
│   임상적 동일성 또는 변화는 자동 판정하지 않습니다 │
├────────────────────────────────────────────────────┤
│ [취소]                         [선택 영상 비교]     │
└────────────────────────────────────────────────────┘
```

## 10.2 HCW-SCR-002 — Side-by-side Viewer

```text
┌ Study A · 2026-09-20 ┬ Study B · 2026-06-12 ┐
│ [Authorized viewport]│ [Authorized viewport]│
│ W/L · Zoom · Pan     │ W/L · Zoom · Pan     │
├──────────────────────┴───────────────────────┤
│ A 12:43 남음 · B 08:17 남음 · [비교 종료]   │
└──────────────────────────────────────────────┘
```

## 10.3 HCW-SCR-003 — 진료 인계 패킷

```text
┌ 인계 패킷 · DRAFT ────────────────────────────────┐
│ 목적: [진료 참고 ▼]  만료: 2026-09-28 18:00      │
│ Study 1  VIEW 허용 ✓  Provenance ✓                │
│ Consent 유효 ✓ · PACS Import 상태: 별도            │
│ 판독문/의뢰서: 별도 권한 없음 — 표시하지 않음      │
│ 다음 상태: [팀 배정]                               │
├────────────────────────────────────────────────────┤
│ [취소]                              [패킷 준비]     │
└────────────────────────────────────────────────────┘
```

## 10.4 HCW-SCR-004 — 팀 배정·인계

```text
┌ 업무 배정 · Version 4 ────────────────────────────┐
│ 담당: 영상의학과 Queue   기한: 16:00              │
│ 상태: ASSIGNED                                    │
│ 사유: [추가 영상 확인 ▼]                          │
│ ※ 배정은 영상 접근권한을 부여하지 않습니다.       │
├────────────────────────────────────────────────────┤
│ [보류] [다시 배정]                    [업무 수락]   │
└────────────────────────────────────────────────────┘
```

## 10.5 HCW-SCR-005 — 병원 알림함

```text
┌ 알림 ─────────────────────────────────────────────┐
│ ● 환자 결정이 변경되었습니다          2분 전       │
│ ● 영상 반입 결과를 확인해야 합니다    8분 전       │
│ ○ 담당 업무가 배정되었습니다          1시간 전     │
│ 상세정보는 로그인·권한 재확인 후 표시됩니다.       │
├────────────────────────────────────────────────────┤
│ [모두 읽음]                           [선택 열기]   │
└────────────────────────────────────────────────────┘
```

세 화면군 모두 `Denied`, `Expired`, `Revoked`, `Conflict`, `PACS unavailable`, `RESULT_UNKNOWN`에서 성공 CTA를 제공하지 않는다.
