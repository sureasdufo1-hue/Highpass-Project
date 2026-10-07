# MediQ SaaS UI/UX Reference Matrix

**Project:** MediQ  
**Document ID:** MEDIQ-SAAS-UI-REF-MATRIX-001  
**Classification:** RESEARCH / NON-NORMATIVE  
**Status:** Reference Matrix — Not an Approved Product Baseline  
**Implementation:** NOT IMPLEMENTED  
**Last Updated:** 2026-09-24  
**Parent:** `SAAS-UI-REFERENCE-RESEARCH.md`

---

# 1. 사용 규칙

이 표는 `SAAS-SCREEN-DESIGN-SPEC.md`의 79개 화면을 공개 Reference에 연결하는 탐색용 색인이다. Reference는 화면 계약이나 보안 통제를 대체하지 않는다. `참고할 요소`만 선택적으로 사용하며 `금지할 요소`는 구현하지 않는다.

| 결정 | 의미 |
|---|---|
| ADOPT | MediQ 불변조건을 유지하면서 직접 참고 가능 |
| ADAPT | 구조는 유용하지만 MediQ 업무·보안에 맞춘 변경 필수 |
| STUDY ONLY | 시각·운영 개념만 참고; 제품 흐름을 채택하지 않음 |

# 2. 개별 화면 Reference Matrix

| MediQ Screen | 화면 | Primary Reference | Secondary Reference | 참고할 요소 | 금지할 요소 |
|---|---|---|---|---|---|
| SAAS-SCR-001 | 로그인 | REF-SAA-01 | REF-SAA-02 | 명확한 조직 context 진입 | client 입력 tenant로 로그인 |
| SAAS-SCR-002 | 인증 Callback | REF-QR-01 | REF-SAA-01 | 진행·만료·실패의 분리 | URL code 장기 유지 |
| SAAS-SCR-003 | 역할·병원 Context | REF-SAA-01 | REF-SAA-02 | verified context switcher | 역할 선택만으로 권한 생성 |
| SAAS-SCR-004 | Session 만료·재인증 | REF-QR-01 | REF-CON-01 | 명시적 expiry와 새 시작 | stale 화면·pixel 유지 |
| SAAS-SCR-005 | 접근 거부 | REF-CON-02 | REF-AUD-02 | 안전한 사유·다음 행동 | 정책·resource 존재정보 과노출 |
| SAAS-SCR-006 | 장애·점검 | REF-ADM-04 | REF-ADM-02 | 영향범위·상태·권장 조치 | success 추정·endpoint 노출 |
| SAAS-SCR-010 | Hospital Dashboard | REF-SAA-05 | REF-SAA-01 | current context·작업 상태 요약 | 데이터 없는 가짜 KPI |
| SAAS-SCR-011 | Exchange 목록 | REF-SAA-05 | REF-AUD-01 | filter·status·time·empty state | cross-tenant row |
| SAAS-SCR-012 | Exchange 상세 | REF-SAA-04 | REF-SAA-05 | summary+단계 detail | client-side 완료 추론 |
| SAAS-SCR-013 | PatientReference 확인 | REF-CON-02 | REF-IMG-01 | 요청 대상 요약 | 일반 환자 전체검색 |
| SAAS-SCR-014 | Exchange 생성 | REF-CON-02 | REF-SAA-04 | 입력 요약·confirm | browser tenant/destination override |
| SAAS-SCR-015 | Exchange Timeline | REF-SAA-04 | REF-AUD-01 | 단계 graph와 event timeline | Consent·Grant·Transfer 상태 병합 |
| SAAS-SCR-016 | Exchange 만료·종료 | REF-QR-01 | REF-CON-01 | terminal state·새 요청 | 만료 session 재사용 |
| SAAS-SCR-020 | Source Hospital 확인 | REF-SAA-01 | REF-SAA-02 | immutable source context | browser에서 source 변경 |
| SAAS-SCR-021 | Source PACS 연결상태 | REF-ADM-01 | REF-ADM-02 | heartbeat·last checked·next action | PACS URL·credential 노출 |
| SAAS-SCR-022 | Study 조회 | REF-IMG-01 | REF-IMG-06 | bounded query·loading | browser→PACS 직접 QIDO |
| SAAS-SCR-023 | Study 목록·필터 | REF-IMG-01 | REF-IMG-05 | date/modality/description filter | PatientName·MRN tenant-wide 검색 |
| SAAS-SCR-024 | Study 상세 | REF-IMG-01 | REF-IMG-02 | Study summary와 action 분리 | UID를 access authority로 취급 |
| SAAS-SCR-025 | Series·Instance 요약 | REF-IMG-01 | REF-IMG-02 | bounded tree·series metadata | session 전 thumbnail/pixel |
| SAAS-SCR-026 | PACS 조회 실패 | REF-ADM-04 | REF-IMG-06 | upstream unavailable·retryability | permanent cloud copy fallback |
| SAAS-SCR-030 | Consent 요청 | REF-CON-02 | REF-CON-01 | 범위·목적·destination 요약 | 요청을 승인 완료로 표시 |
| SAAS-SCR-031 | Consent 상태 | REF-CON-02 | REF-CON-04 | pending/active/withdrawn/expired | Boolean 하나로 축약 |
| SAAS-SCR-032 | Patient Consent 확인 | REF-CON-01 | REF-CON-04 | 환자 관점의 범위 재검토 | local patient ID 표시 |
| SAAS-SCR-033 | Patient Consent 승인 | REF-CON-02 | REF-CON-04 | 명시적 submit·version 확인 | Consent를 Grant 발급으로 표현 |
| SAAS-SCR-034 | Consent 철회 | REF-CON-04 | REF-CON-02 | 현재 상태·철회 영향 confirm | 완료된 반입 삭제 보장 |
| SAAS-SCR-035 | Consent 만료·불일치 | REF-QR-01 | REF-CON-03 | fail-closed·새 요청 | 자동 범위 확대·자동 갱신 |
| SAAS-SCR-036 | Transfer Grant 발급 | REF-CON-02 | REF-CON-03 | recipient/scope/expiry review | active Consent만으로 자동 발급 |
| SAAS-SCR-037 | Transfer Grant 상태 | REF-QR-01 | REF-CON-02 | active/expired/revoked/consumed | action scope 혼합 |
| SAAS-SCR-038 | Transfer Grant 철회 | REF-CON-02 | REF-CON-04 | 대상·영향·확인 | 이미 완료된 transfer 취소 표현 |
| SAAS-SCR-039 | Authorization 거부 | REF-CON-02 | REF-AUD-02 | 안전한 outcome·correlation | 내부 정책 rule 공개 |
| SAAS-SCR-040 | Viewer 시작 확인 | REF-IMG-02 | REF-CON-02 | mode·scope·session 제한 확인 | URL 진입만으로 Viewer 허용 |
| SAAS-SCR-041 | Viewer Session 생성 | REF-IMG-06 | REF-QR-01 | 준비중·expiry·idempotent retry | PACS credential 전달 |
| SAAS-SCR-042 | Cloud DICOM Viewer | REF-IMG-03 | REF-IMG-04 | 최소 toolbar·viewport | browser→PACS 직접 WADO |
| SAAS-SCR-043 | Series·Instance 탐색 | REF-IMG-01 | REF-IMG-02 | side panel·thumbnail navigation | UID 단독 권한 |
| SAAS-SCR-044 | W/L·Zoom·Pan | REF-IMG-03 | REF-IMG-04 | 표준 조작·reset | 진단 인증 과장 |
| SAAS-SCR-045 | Viewer Session 만료 | REF-QR-01 | REF-CON-01 | countdown·terminal clear | pixel/stale cache 유지 |
| SAAS-SCR-046 | Source PACS·Frame 오류 | REF-ADM-04 | REF-IMG-04 | frame 실패와 session 상태 분리 | 전체 성공/영구 copy 추정 |
| SAAS-SCR-047 | Consent·Grant 철회 종료 | REF-CON-04 | REF-QR-01 | 즉시 중지·권한 변경 안내 | 이미 받은 frame 재사용 |
| SAAS-SCR-050 | Download 확인 | REF-CON-02 | REF-SAA-04 | resource/action/위험 재확인 | VIEW scope 자동승격 |
| SAAS-SCR-051 | Download 진행 | REF-SAA-05 | REF-QR-01 | 실제 byte/state·expiry | 가짜 percent·자동 재요청 |
| SAAS-SCR-052 | Download 완료 | REF-SAA-05 | REF-AUD-01 | 완료시각·correlation | PACS Import 완료로 표현 |
| SAAS-SCR-053 | Download 실패·만료 | REF-QR-01 | REF-ADM-04 | retryability·새 Grant 안내 | 임의 retry·stale Grant |
| SAAS-SCR-060 | Destination Hospital 확인 | REF-SAA-01 | REF-CON-02 | destination context 재표시 | browser destination 변경 |
| SAAS-SCR-061 | Destination Patient Mapping | REF-SAA-04 | REF-AUD-03 | check state·evidence link | local patient ID 과노출 |
| SAAS-SCR-062 | PACS Import Preflight | REF-SAA-04 | REF-SAA-05 | checklist·step status | UNKNOWN을 READY로 취급 |
| SAAS-SCR-063 | 최종 확인 | REF-CON-02 | REF-SAA-04 | 위험 작업 scope confirm | stale preflight 재사용 |
| SAAS-SCR-064 | 전송 요청 | REF-SAA-05 | REF-SAA-04 | submit once·operation ID | double-click duplicate STOW |
| SAAS-SCR-065 | 전송 진행 | REF-SAA-04 | REF-SAA-05 | retrieve/package/STOW/verify stepper | client timer 기반 percent |
| SAAS-SCR-066 | 부분 성공·재시도 대기 | REF-SAA-04 | REF-SAA-05 | failed step·unknown·reconcile | 전체 blind rerun |
| SAAS-SCR-067 | Destination Verification | REF-AUD-03 | REF-SAA-04 | expected/observed evidence | STOW 2xx만으로 verified |
| SAAS-SCR-068 | Integrity 결과 | REF-AUD-03 | REF-AUD-02 | pass/pending/fail·timestamp | fail을 warning으로 축소 |
| SAAS-SCR-069 | PACS Import 완료 | REF-SAA-04 | REF-AUD-01 | verified gate·evidence links | gate 미충족 success |
| SAAS-SCR-070 | 전송 실패·거부 | REF-SAA-04 | REF-ADM-04 | failure category·safe recovery | STOW 호출 여부 은폐·성공 추정 |
| SAAS-QR-001 | Scanner 시작 | REF-QR-03 | REF-SAA-01 | 현재 actor/organization·local auth | 환자정보 선표시 |
| SAAS-QR-002 | 카메라 권한 | REF-QR-03 | REF-QR-04 | 권한 목적·대체 경로 | frame 저장·분석 SDK |
| SAAS-QR-003 | QR 검증 | REF-QR-01 | REF-QR-04 | local format/origin/expiry check | QR 자체를 access token으로 사용 |
| SAAS-QR-004 | Claim 요청 | REF-QR-01 | REF-QR-02 | claim과 approval 분리 | hospital fields body override |
| SAAS-QR-005 | 환자 승인 대기 | REF-QR-01 | REF-CON-01 | countdown·pairing reference | patient/study/source 노출 |
| SAAS-QR-006 | 거절·취소·만료 | REF-QR-01 | REF-CON-01 | terminal state·new request | expired request 재활성화 |
| SAAS-QR-007 | 중복 Claim·충돌 | REF-QR-01 | REF-QR-03 | conflict·rescan | winner identity/PHI 노출 |
| SAAS-QR-008 | VIEW Grant 준비 | REF-QR-02 | REF-CON-02 | exact action confirmation | Scan=VIEW 허가 |
| SAAS-QR-009 | PACS_IMPORT Grant 준비 | REF-QR-02 | REF-SAA-04 | exact action·preflight handoff | Grant=PACS 완료 |
| SAAS-QR-010 | Grant 실패 | REF-QR-01 | REF-ADM-04 | failed/expired/retryable 분리 | 공유되었다고 낙관 표시 |
| SAAS-SCR-080 | Exchange Audit Timeline | REF-AUD-01 | REF-AUD-02 | actor/action/outcome/time | payload·cross-tenant event |
| SAAS-SCR-081 | Provenance 상세 | REF-AUD-03 | REF-SAA-04 | source→process→destination graph | UID/object URL 과노출 |
| SAAS-SCR-082 | Integrity Evidence | REF-AUD-03 | REF-AUD-02 | expected/observed·result | raw DICOM·전체 hash 기본 노출 |
| SAAS-SCR-083 | 접근·거부 이력 | REF-AUD-01 | REF-AUD-02 | allow/deny filter·safe reason | 공격정책 세부 공개 |
| SAAS-SCR-084 | Correlation 오류 추적 | REF-AUD-02 | REF-ADM-04 | correlation/time/category | stack·endpoint·credential |
| SAAS-SCR-085 | 보안 이벤트 목록 | REF-AUD-02 | REF-ADM-04 | severity·scope·filter | P0 Hospital User 노출 |
| SAAS-ADM-001 | Tenant 목록·상세 | REF-SAA-02 | REF-SAA-03 | organization-scoped admin | 플랫폼 전체와 병원 admin 혼합 |
| SAAS-ADM-002 | Hospital 등록·상태 | REF-SAA-02 | REF-ADM-01 | onboarding/status/trust | secret·credential 표시 |
| SAAS-ADM-003 | 사용자·역할 | REF-SAA-03 | REF-CON-02 | membership·role·review | 임의 custom 권한·권한 자동승격 |
| SAAS-ADM-004 | PACS Connector 등록 | REF-ADM-01 | REF-ADM-02 | identity/capability/health | PACS password 원문 입력·표시 |
| SAAS-ADM-005 | DICOMweb Endpoint | REF-IMG-06 | REF-ADM-01 | QIDO/WADO/STOW capability | browser 노출·SSRF 가능한 자유 URL |
| SAAS-ADM-006 | 인증서·mTLS | REF-ADM-03 | REF-ADM-01 | issuer/expiry/rotation state | private key·full secret 표시 |
| SAAS-ADM-007 | VPN·Private Connectivity | REF-ADM-02 | REF-ADM-01 | network health·last check | tunnel healthy=E2E secure |
| SAAS-ADM-008 | 정책·TTL·Rate Limit | REF-CON-03 | REF-CON-02 | version/expiry/reviewer | 무검토 scope 확대 |
| SAAS-ADM-009 | Temporary Object·Purge | REF-AUD-03 | REF-AUD-02 | lifecycle evidence·timestamp | object URL·DICOM payload |
| SAAS-ADM-010 | Queue·Worker 상태 | REF-SAA-05 | REF-ADM-04 | queue/run/incident status | blind retry·PHI log |

# 3. Coverage Summary

| 화면군 | 화면 수 | Primary/Secondary Reference 수 | Coverage | 비고 |
|---|---:|---:|---|---|
| 로그인·Context | 6 | 8 | COVERED | Test banner는 자체 설계 |
| Dashboard·Exchange | 7 | 10 | COVERED | Multi-lane timeline 자체 변형 |
| Study 탐색 | 7 | 10 | COVERED | 일반 환자검색 제거 필수 |
| Consent·Grant | 10 | 13 | COVERED | 3분리 모델은 MediQ 고유 |
| Cloud Viewer | 8 | 13 | COVERED | Gateway/session guard 추가 |
| Download | 4 | 7 | COVERED | Result unknown 자체 설계 |
| PACS Import | 11 | 17 | COVERED | verification/integrity gate 고유 |
| QR Hospital Web | 10 | 17 | COVERED | PHI 선노출 금지 |
| Audit·Provenance | 6 | 10 | COVERED | safe projection 필요 |
| Tenant·Hospital 관리 | 10 | 16 | COVERED | 대부분 POST-MVP/Productionization |
| 합계 | 79 | 121 연결 | COVERED | 구현·테스트 증거 아님 |

# 4. Reference ID Index

| Prefix | 범위 | 제품 유형 |
|---|---|---|
| REF-IMG | 01~06 | 의료영상 Viewer·PACS |
| REF-CON | 01~04 | Consent·의료정보 교환 |
| REF-SAA | 01~05 | Multi-tenant SaaS·Workflow |
| REF-AUD | 01~03 | Audit·Provenance |
| REF-QR | 01~04 | QR·Pairing·Cross-device approval |
| REF-ADM | 01~04 | Connector·Certificate·Service Health |

전체 URL, 평가 점수, 확인된 사실, 추론 및 저작권 주의사항은 `SAAS-UI-REFERENCE-RESEARCH.md`를 따른다.
