# Highpass PHR MVP 문서 묶음

상태: `W02~W07 LOCAL IMPLEMENTED / EXTERNAL INTEGRATIONS DEFERRED`
기준일: 2026-09-09
범위: 합성데이터 기반 로컬 PoC

이 디렉터리는 기존 Highpass v2.1 원격조회 기준선을 보존하면서 FHIR R4 기반 개인의료정보 조회를 증분 확장한다. 합성 Provider/API, 환자 UI, ImagingStudy 매핑과 서비스 수직경로는 구현됐으며 실제 MyHealthWay·IdP·병원 PACS·모바일 앱은 범위 밖이다.

## 문서 순서

1. [PHR MVP 구현계획](PHR-MVP-IMPLEMENTATION-PLAN.md) — 기준선, 범위, 구현 매트릭스, 책임경계, 다음 작업
2. [PHR 요구사항](PHR-REQUIREMENTS.md) — 신규 ID와 기존 FR/VR 추적성
3. [FHIR 매핑 명세](FHIR-MAPPING-SPEC.md) — R4 최소 리소스, 식별자, 보존·미지원 규칙
4. [Provider 및 PHR API 계약](HEALTH-DATA-PROVIDER-CONTRACT.md) — 논리 인터페이스와 승인 전 API 초안
5. [ImagingStudy–DICOM 매핑](IMAGINGSTUDY-DICOM-MAPPING.md) — UID·기관·환자·접근 가능성 검증
6. [PHR 시험계획](PHR-TEST-PLAN.md) — PHR-T01~T15, fixture와 증적 계약
7. [공동합의 권고안](JOINT-AGREEMENT-RECOMMENDATIONS.md) — API, fixture, UID, 감사, 단일 공유경로의 권고 결정
8. [PHR-W02 실행 보고서](PHR-W02-EXECUTION-REPORT.md) — 합성 fixture·UID·checksum 계약 구현 및 검증
9. [PHR-W03 실행 보고서](PHR-W03-EXECUTION-REPORT.md) — Provider·환자격리·pagination·MyHealthWay 비활성 구현
10. [PHR-W04 실행 보고서](PHR-W04-EXECUTION-REPORT.md) — `/me` PHR API·opaque 영상참조·canonical 감사 구현
11. [PHR-W05 실행 보고서](PHR-W05-EXECUTION-REPORT.md) — 최소 환자 UI·OpenAPI·브라우저 검증
12. [진행상황 보고서](PHR-STATUS-REPORT-2026-09-08.md) — 보고자용 현재 상태·시험·위험·결정 요청
13. [WBS 변경 영향](../project-management/PHR-WBS-CHANGE-IMPACT.md) — 공수, 일정, Critical Path, 승인 Gate

## 기준선 해석

- 현행 구현 기준: `docs/requirements/highpass-v2.1-integrated-requirements-definition.md`
- Mobile-Core 목표 계약: `docs/requirements/highpass-mobile-core-requirements-definition.md`, 승인 전 Draft
- PHR 확장: 본 문서 묶음, 승인 전 Draft
- Privacy Filter: 임상 PHR 경로와 분리하며 PF-0~PF-6 상태를 변경하지 않음
- 실제 MyHealthWay 연동: `NOT CONFIGURED`, 외부 호출 금지

문서 간 충돌 시 `AGENTS.md`의 Source of Truth와 보안 우선순위를 적용한다. 본 제안은 승인된 기존 계약을 자동 대체하지 않는다.
