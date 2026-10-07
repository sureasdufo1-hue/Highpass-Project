# MediQ QR Handoff UI/UX Specification

| Field | Value |
|---|---|
| Document ID | MEDIQ-QR-UX-001 |
| Document Title | QR Handoff Mobile and Hospital Web UI/UX Specification |
| Version | 0.1.0 |
| Status | PROPOSED — CAPSTONE-P1 Design Baseline |
| Owner | MediQ Product, Mobile, Web & Security |
| Related Documents | `MOBILE-UI-UX-SPEC.md`, `P0-WEB-UI-UX-SPEC.md`, `QR-REQUEST-STATE-MODEL.md` |
| Last Updated | 2026-09-21 |

## 1. UX goals

The user must understand four separate moments: QR displayed, hospital connected, patient approved, and Grant/transfer ready. No screen may imply that displaying or scanning the QR completed Consent or transfer.

The patient approval screen is the principal anti-misdirection control. It independently retrieves and displays the verified hospital, actor, source, Study, purpose, action and expiry from MediQ.

## 2. Screen inventory

| Screen ID | Client | Screen | Entry state | Primary action |
|---|---|---|---|---|
| QR-UI-01 | Mobile | 의료영상 공유 시작 | Authenticated | Start |
| QR-UI-02 | Mobile | Study 선택 | Study list | Select one Study |
| QR-UI-03 | Mobile | 요청 작업·목적 선택 | Study selected | Choose `VIEW` or `PACS_IMPORT` |
| QR-UI-04 | Mobile | QR 생성 확인 | Valid selection | Create request |
| QR-UI-05 | Mobile | QR 표시 및 스캔 대기 | `CREATED` | Display/cancel |
| QR-UI-06 | Hospital Web | QR 스캐너 | Authenticated hospital context | Scan |
| QR-UI-07 | Hospital Web | 연결 요청 대기 | Claimed | Wait/cancel local view |
| QR-UI-08 | Mobile | 요청 병원 확인 | Awaiting approval | Review |
| QR-UI-09 | Mobile | Consent 확인 | Pending/matching Consent | Approve Consent |
| QR-UI-10 | Mobile | 최종 승인 | Active matching Consent | Approve/reject |
| QR-UI-11 | Both | Grant 발급 중 | Pending | Poll |
| QR-UI-12 | Both | 승인·연결 완료 | `GRANT_ISSUED` | Continue to Viewer/transfer |
| QR-UI-13 | Both | 만료/취소/거절 | Terminal | Close/new request |
| QR-UI-14 | Hospital Web | QR 검증 실패 | Invalid/unavailable | Rescan |
| QR-UI-15 | Both | 중복 스캔·상태 충돌 | Conflict | Refresh/new request |

## 3. Patient mobile flow

### QR-UI-01 — Share start

- Entry from an authenticated patient Study/Vault context.
- Explain that a receiving hospital must be logged into MediQ.
- Explain that QR contains no image and a separate confirmation follows.
- CTA: `의료기관과 연결하기`.

### QR-UI-02 — Study selection

Show only patient-authorized Studies using safe display metadata:

- source hospital display name;
- Study date;
- modality;
- study description where policy permits;
- no raw UID by default.

One QR request selects exactly one Study.

### QR-UI-03 — Action and purpose

Use separate radio controls:

```text
( ) 영상 보기 허용
    병원 B 의료진이 제한된 시간 동안 클라우드 뷰어로 조회합니다.

( ) 병원 B PACS로 전송 허용
    검증 후 병원 B의 PACS에 영상 사본이 반입됩니다.
```

Do not preselect `PACS_IMPORT`. The purpose is selected from policy-controlled codes; no unrestricted free text.

### QR-UI-04 — Create confirmation

Display Study, source hospital, action and a warning that destination is not yet known. CTA: `5분 QR 생성`. Creation may require recent patient reauthentication.

### QR-UI-05 — QR display/wait

Required elements:

- QR image;
- countdown based on server expiry with a local approximation label;
- selected Study and action;
- status `의료기관 스캔 대기 중`;
- `요청 취소` button;
- six-character `displayReference`, initially labelled as a pairing check value;
- automatic authenticated polling.

Required message:

> 이 QR은 의료영상 공유 요청을 연결하기 위한 코드입니다. 의료기관이 스캔한 뒤 병원과 요청 내용을 다시 확인하고 승인해야 공유가 진행됩니다.

Do not show `동의 완료`, `전송 중` or `공유 완료` at this stage.

### QR-UI-08 — Verify requesting hospital

This screen is populated only from authenticated MediQ server data. Show prominently:

1. verified destination hospital name and trust badge;
2. requesting staff display name and role where policy permits;
3. source hospital;
4. selected Study summary;
5. purpose;
6. exactly one action and plain-language consequence;
7. approval deadline;
8. `displayReference` and instruction to compare with Hospital Web when physically present.

Warning: “병원 또는 요청 내용이 다르면 승인하지 마세요.”

### QR-UI-09 — Consent

QR approval is not Consent. Display the applicable technical Consent/version and allowed action. The patient must complete the existing Consent action first. If an existing ACTIVE Consent exactly covers patient, source, destination, Study/resource, purpose and action, show its version and expiry instead of creating an implicit replacement.

### QR-UI-10 — Final approval

Immediately before approval, repeat destination, Study, purpose, action and duration. Buttons are visually distinct:

```text
[거절]     [내용을 확인하고 승인]
```

Approval sends no destination/Study override. It submits only matching Consent/version, pairing reference and confirmed action. Step-up/recent reauthentication is required.

### QR-UI-11/12 — Issuance and completion

During issuance say `접근 권한을 확인하고 있습니다`, not `전송 중`.

After issuance:

- VIEW: “병원에서 제한된 시간 동안 뷰어를 열 수 있습니다.”
- PACS_IMPORT: “전송 권한이 준비되었습니다. 실제 전송과 목적지 검증은 별도로 진행됩니다.”

Never label QR completion as PACS transfer completion.

## 4. Hospital Web flow

### QR-UI-06 — Scanner

- Require authenticated workforce session and visible hospital context before camera activation.
- Show hospital name and logged-in actor continuously.
- Decode locally; do not upload camera frames.
- Validate MediQ origin/version/length before claim.
- Provide permission and accessibility guidance.

### QR-UI-07 — Waiting

Before patient approval display only:

- pairing reference;
- requested action;
- expiry/countdown;
- “환자 승인 대기 중”.

Do not show patient name, ID, Study UID, image thumbnail or source details.

After claim, the destination hospital is immutable. To use another hospital context, cancel/expire and create a new QR.

### QR-UI-12 — Ready

Only after `GRANT_ISSUED`, enable the action matching the Grant:

- `영상 보기` for `study:view`;
- `PACS 반입 시작` for `study:pacs-transfer`.

The Web client still calls the existing protected action endpoint. The button is not proof of authorization.

## 5. Terminal and error UX

| Condition | Patient message | Hospital message | Action |
|---|---|---|---|
| Expired before claim | “QR 유효시간이 끝났습니다.” | Generic unavailable | New request |
| Approval window expired | “승인 시간이 만료되었습니다.” | “요청이 종료되었습니다.” | New request |
| Rejected | “요청을 거절했습니다.” | “환자가 요청을 승인하지 않았습니다.” | Close |
| Cancelled | “요청을 취소했습니다.” | “요청이 종료되었습니다.” | Close |
| Already claimed | Patient sees claimed hospital | Other scanner sees generic claimed/unavailable | Do not reveal identity |
| Consent mismatch | “동의 범위를 다시 확인해야 합니다.” | “승인 준비가 완료되지 않았습니다.” | Correct/new request |
| Grant issuance failure | “권한을 발급하지 못했습니다. 영상은 공유되지 않았습니다.” | Same safe outcome | Retry only if server says retryable |
| Network loss | Preserve latest verified state, never infer success | Refresh/poll | Idempotent retry |

## 6. Privacy and screen protection

- Use Android secure-window policy for patient QR approval and Study screens consistent with mobile security baseline.
- Immediately apply the privacy screen when mobile app backgrounds.
- Do not place QR payload or patient summary in notifications, clipboard or recent-app snapshots.
- Hospital scanner must not retain camera frames or QR bitmaps.
- Do not use third-party QR analytics SDKs.
- No PHI in browser history, URL, page title, telemetry or crash report.

## 7. Accessibility and usability

- Never rely on color alone for state or risk.
- Support screen readers, dynamic type and keyboard navigation.
- Announce countdown at sensible intervals, not every second.
- Provide a future manual code fallback as an OPEN DECISION; it is not part of v1 API.
- Use at least 44dp mobile touch targets and visible focus states on Web.
- All irreversible actions include the object/action summary in text.

## 8. UI security invariants

- `QR-UX-INV-001`: QR displayed must not appear as approved.
- `QR-UX-INV-002`: Scanner claim must not reveal patient/Study details before approval.
- `QR-UX-INV-003`: Approval summary must come from server, not QR fields.
- `QR-UX-INV-004`: Displayed action must equal issued Grant scope.
- `QR-UX-INV-005`: Destination cannot change after patient review without a new request.
- `QR-UX-INV-006`: Client timeout/network errors never render success optimistically.

