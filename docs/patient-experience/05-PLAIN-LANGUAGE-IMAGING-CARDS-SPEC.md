# MediQ 쉬운 의료영상 카드 기능 명세

**Feature:** 5 — Plain-language Imaging Cards  
**Classification:** `CAPSTONE-P1`  
**Version:** v1.0  
**Status:** Approved Design Baseline — Not Implemented / Not Tested  
**Primary Ticket:** `MEDIQ-PXE-IC-001`

## 1. 결정 요약

DICOM Study/Series Metadata의 최소 허용 필드를 환자 친화 카드로 표현한다. 표시 용어는 버전이 있는 Mapping Table로 변환하되 원본을 수정하지 않는다. 정보가 없거나 충돌하면 추정하지 않고 `정보 없음` 또는 `확인 필요`로 표시한다.

## 2. 카드 정보 구조

| 우선순위 | 표시 | 근거 |
|---:|---|---|
| 1 | 검사 날짜 | 승인된 Study date/time Projection |
| 2 | 영상 종류 | Modality Mapping: CT, MRI, X-ray 등 |
| 3 | 촬영 부위 | Body Part Mapping, 없으면 생략/정보 없음 |
| 4 | 출처 기관 | Tenant-safe 사용자용 기관 표시명 |
| 5 | 영상 수·Series 수 | 서버 검증 Count |
| 6 | 이용 상태 | Cloud View 가능, Vault 저장, 만료, 이동 중 |

환자명, 생년월일, Hospital-local Patient ID, Accession Number, 전체 DICOM UID, 진단 관련 필드는 기본 카드에서 제외한다.

## 3. 화면

| ID | 화면 | 내용 |
|---|---|---|
| `MOB-PXE-IC-001` | 영상 카드 목록 | 쉬운 제목, 날짜, 종류, 부위, 상태 |
| `MOB-PXE-IC-002` | 영상 정보 | 출처, Series/Instance 수, 허용 행위 |
| `MOB-PXE-IC-003` | 기술 정보 보기 | 재인증 후 최소 원본 Metadata, 복사 제한 |

기존 `MOB-05`, `MOB-06`, Vault 목록·상세에서 Component로 재사용한다.

## 4. 기능 요구사항

| ID | 요구사항 |
|---|---|
| `REQ-PXE-IC-001` | 시스템은 Allowlist된 Metadata만 카드 Projection에 포함해야 한다. |
| `REQ-PXE-IC-002` | Modality와 Body Part는 버전·Locale이 있는 Mapping으로 표시해야 한다. |
| `REQ-PXE-IC-003` | Mapping이 없으면 원문을 무분별하게 노출하지 않고 안전한 Unknown Label을 표시해야 한다. |
| `REQ-PXE-IC-004` | 날짜 또는 Count가 Source 간 충돌하면 하나를 추정하지 않고 확인 필요 상태를 표시해야 한다. |
| `REQ-PXE-IC-005` | 카드 선택 시 현재 권한과 자원 상태를 서버에서 재검증해야 한다. |
| `REQ-PXE-IC-006` | 정렬·검색은 날짜, Modality, 기관, 보관 상태에 한정하고 진단 검색을 제공하지 않아야 한다. |
| `REQ-PXE-IC-007` | Presentation Mapping 변경은 원본 Metadata와 기존 Audit를 변경하지 않아야 한다. |
| `REQ-PXE-IC-008` | 의료 용어에는 쉬운 설명과 “진단 정보가 아님” 안내를 제공해야 한다. |

## 5. 보안·임상 안전 요구사항

| ID | 요구사항 |
|---|---|
| `SEC-PXE-IC-001` | Card Projection은 Tenant/Patient/Study 접근 검증 후 생성해야 한다. |
| `SEC-PXE-IC-002` | 환자 식별자, Accession Number, UID, 진단·Free Text를 기본 카드에서 제외해야 한다. |
| `SEC-PXE-IC-003` | Description Free Text를 진단 문구로 재작성하거나 정상/이상을 추론하지 않아야 한다. |
| `SEC-PXE-IC-004` | 기술 정보 화면은 재인증과 최소 공개 정책을 적용해야 한다. |
| `SEC-PXE-IC-005` | Cache는 Mobile Vault 보안경계 내 암호화하고 계정/기기 철회 시 무효화해야 한다. |

## 6. 논리 데이터·API GAP

`ImagingCardProjection`은 studyRef, studyDate, modalityCode/display, bodyPartCode/display, sourceOrganizationDisplay, seriesCount, instanceCount, availabilityState, mappingVersion을 가진다. 원본 UID는 내부 연결에만 사용하고 응답·로그 Allowlist를 별도로 검토한다.

기존 Study 목록 API를 확장하거나 `ListMyImagingCards`를 추가해야 하며 현재 Contract GAP다. Mapping Table 배포·Rollback·Locale 정책은 ADR로 확정한다.

## 7. 접근성·국제화

- 날짜는 사용자 Locale로 표시하되 연도 포함, 상대 날짜만 단독 사용하지 않는다.
- CT/MRI 약어와 풀네임을 함께 제공한다.
- 카드 전체를 하나의 모호한 버튼으로 만들지 않고 제목·상태·행동을 Screen Reader에 구분한다.
- 긴 기관명은 시각적으로 줄여도 접근성 이름에는 전체 표시명을 제공한다.
- 색상 없이 만료·오프라인·오류를 식별한다.

## 8. 위협과 통제

| 위협 | 통제 |
|---|---|
| Free Text를 통한 PHI/진단 노출 | 필드 Allowlist, Free Text 제외 |
| 잘못된 용어 번역 | Versioned Mapping, Unknown fallback |
| 타인 Study 카드 노출 | 서버 Patient/Tenant Binding |
| UI가 진단을 암시 | 임상 추론 금지, 중립 라벨 |
| 오래된 Cache로 접근 | 상태 재검증, Cache 무효화 |

## 9. Acceptance

| ID | 시나리오 | 예상 결과 |
|---|---|---|
| `TC-PXE-IC-001` | CT·MRI 합성 Study | 쉬운 종류·날짜·출처 표시 |
| `TC-PXE-IC-002` | Unknown Modality/Body Part | 추정 없이 정보 없음 표시 |
| `TC-PXE-IC-003` | 날짜 Source 충돌 | 확인 필요, 임의 날짜 미표시 |
| `TC-PXE-IC-004` | Description에 진단성 문구 | 기본 카드 미노출 |
| `TC-PXE-IC-005` | 다른 환자 studyRef 주입 | 존재 여부 노출 없이 거부 |
| `TC-PXE-IC-006` | 200% 글씨·TalkBack | 정보·상태·CTA 식별 가능 |

모든 Test는 `NOT RUN`이다.

## 10. 구현 계획과 완료 경계

`MEDIQ-PXE-IC-001` Projection/Mapping, `IC-002` Android Component, `IC-003` Metadata Security/Accessibility Test로 진행한다. 진단 해석, 판독문 요약, 운영 DICOM 검증은 포함하지 않으며 구현·시험되지 않았다.
