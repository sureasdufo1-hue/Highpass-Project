# PHR WBS 변경 영향 및 2026-10-21 일정 제안

상태: `PROPOSED / PM APPROVAL REQUIRED`  
산정 기준일: 2026-09-08  
단위: 인일(person-day), 1인일=집중 개발 6시간 가정. 수업·공휴일·실가용시간 미확인.

## 기준선 조사

- 기존 Mobile-Core WBS 문서는 dependency WBS-01~18을 정의하지만 달력형 10월 21일 간트와 실제 담당자 가용시간은 저장소에서 찾지 못했다.
- v2.1은 현행 Draft baseline, v3 Mobile-Core는 승인 전 Target이다. v3 실행코드는 문서/OpenAPI/DDL/Schema 중심이고 모바일 앱은 저장소에 없다.
- PHR/FHIR 코드·fixture·OpenAPI는 현재 없다. 따라서 아래는 재사용 검증을 반영한 신규 순증분 공수다.

## 책임경계

| 작업 | 이재석 | 김범희 | 변경통제 |
|---|---|---|---|
| PHR Web/Mobile, Cloud PHR API/Provider, Cloud auth/consent/store/deploy | 구현 책임 | 계약 검토 | Edge로 이동 금지 |
| FHIR 의미·mapping·검증기준 | 구현 협력 | 계약 책임 | Cloud 정규화 코드는 이재석 구현 |
| ImagingStudy–UID, A/B Edge, PACS/DICOMweb/OHIF | 계약 소비 | 구현 책임 | Cloud가 PACS 직접 호출 금지 |
| package crypto/key release Cloud/Mobile | 구현 책임 | 입력·수신 계약 검토 | 평문 DEK Cloud 영속 금지 |
| B Edge 복호화·무결성·PACS 입력 | 계약 소비 | 구현 책임 | PACS_IMPORT 별도 권한 |
| PM, 통합시험, 보고·시연 | 증적 제공 | 총괄 책임 | 상대 코드 수정 전 계약/CR/test |

## 신규 WBS와 공수 범위

| ID | 작업 | 이재석 | 김범희 | 합계 | 선행 | 종료 Gate |
|---|---|---:|---:|---:|---|---|
| PHR-W01 | 계약 승인·ADR·fixture 의료일관성 검토 | 1.0 | 1.5 | 2.5 | 본 문서 | Contract Gate |
| PHR-W02 | 자체 합성 R4 A/B fixture·manifest | 1.5 | 1.5 | 3.0 | W01 | schema/isolation/checksum |
| PHR-W03 | Provider interface + Synthetic/MyHealthWay-disabled adapter | 3.0 | 1.0 | 4.0 | W01~02 | provider unit/negative |
| PHR-W04 | patient binding + PHR API + audit | 4.0 | 1.0 | 5.0 | W03 | PHR-T01~03,07,13,14 |
| PHR-W05 | PHR Web/Mobile 최소 화면 | 4.0 | 0.5 | 4.5 | W04 | 접근성·상태·본인자료 |
| PHR-W06 | ImagingStudy–Orthanc mapping validator | 0.5 | 3.5 | 4.0 | W02~04 | PHR-T04~05,07 |
| PHR-W07 | PHR→기존 token/Gateway/OHIF 연결 | 1.0 | 3.0 | 4.0 | W06 | PHR-T06,11 |
| PHR-W08 | 기존 consent/share + Mobile-Core 최소경로 연결 | 4.0 | 3.0 | 7.0 | W05~07, 기존 WBS-09~12 | PHR-T08~10 |
| PHR-W09 | E2E·장애·로그누출·회귀·결함수정 | 2.5 | 4.0 | 6.5 | W03~08 | PHR-T01~15 |
| PHR-W10 | 시연 고정·증적·보고서 | 1.0 | 2.5 | 3.5 | W09 | 재현 run + 승인 |
|  | 합계 | **22.5** | **21.5** | **44.0** |  |  |

추정 정확도는 현재 `ROM ±30%`다. Mobile 앱 실제 플랫폼, 기존 WBS 완료율, 가용시간, 공개 휴일/수업 일정이 확인되면 재산정해야 한다. 2명이 병렬로 집중하면 이론상 22.5 작업일이나, 계약·Edge 선행관계와 결함 buffer 때문에 달력상 6주가 필요하다.

## 달력 제안

| 기간 | Gate | 주요 작업/소유 |
|---|---|---|
| 9/9~9/11 | G0 기준선 승인 | W01, PM/양 담당자 |
| 9/14~9/18 | G1 Contract Gate | W02 및 API/상태/UID 계약 |
| 9/21~9/25 | G2 PHR 조회 | W03~W05, 이재석 중심 |
| 9/28~10/2 | G3 영상연결 | W06~W07, 김범희 중심 |
| 10/5~10/9 | G4 공유 수직경로 | W08, 공동 |
| 10/12~10/16 | G5 수용시험 | W09, 김범희 총괄 |
| 10/19~10/21 | G6 안정화/완료판정 | W10, 신규기능 금지 |

## Critical Path

`계약승인 → identity/fixture → Provider/API → Imaging UID 검증 → 기존 DICOMweb 연결 → 공유 수직경로 → 음성/E2E → 증적`

가장 큰 일정 위험은 PHR 조회 자체가 아니라 미구현 Mobile-Core package/handoff/key-release를 P0로 동시에 완성하려는 것이다. 9/11까지 최소 공유 수직경로를 승인하지 못하면 10/21 전체 PHR-T15 PASS 가능성이 낮다.

## 범위조정 원칙

일정 압박 시 순서대로 자체 fixture import UI, 공공 API, 전체 FHIR server, 고급검색, 실제 MyHealthWay, 두 번째 모바일 OS를 후속으로 둔다. 기존 인증·동의·인가·DICOMweb과 Privacy 최소 안전경로를 제거하거나 보안시험을 생략하지 않는다. 기존 P0 변경은 별도 범위변경 등록부에 ID, 사유, 보안/일정 영향, 후속 릴리스, 잔여위험을 기록해야 한다.

## PM/공동 승인 필요사항

공동 기술항목의 권고 결정은 [`docs/phr/JOINT-AGREEMENT-RECOMMENDATIONS.md`](../phr/JOINT-AGREEMENT-RECOMMENDATIONS.md)에 기록했다. 특히 `PHR-JA-005`는 Mobile-Core 모바일 package/PACS_IMPORT를 후속 Gate로 두는 범위변경이므로 PM 승인이 없으면 적용할 수 없다.

1. v2.1 증분 PHR 기준선과 신규 PHR-FR-001~018
2. API path/envelope/pagination/error enum
3. 자체 fixture 사용과 의료일관성 검토 책임
4. 9/11 기준 Mobile-Core 최소 공유경로(PACS_IMPORT 포함 여부, 단일 모바일 OS)
5. 각 담당자의 주당 실제 가용 인일과 공휴일/수업 반영
6. PHR 정규화 데이터 비영속 read-through 권고
7. 실제 MyHealthWay 및 실제 PHI 비활성 정책
