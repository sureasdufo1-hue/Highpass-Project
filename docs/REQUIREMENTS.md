# Highpass 요구사항 기준 문서

상태: **v3 Architecture / ERD / API 문서 정렬 완료 / 통합 검토 대기**
기준일: 2026-09-12

## Highpass v3 목표 기준선

[Highpass v3 Architecture & Product Baseline](baseline/HIGHPASS-V3-BASELINE.md)을 향후 제품·아키텍처의 목표 Single Source of Truth로 수립했다. 이 결정은 설계 목표를 고정하지만 현재 코드가 v3를 구현 완료했다는 뜻은 아니다. 실제 구현 기준은 아래 v2.1과 Mobile-Core 자산을 보존하며, [v3 Scope/Gates](baseline/HIGHPASS-V3-SCOPE.md)와 [Decision Log](baseline/DECISION-LOG.md)의 승인·구현·시험 절차를 따른다.

[Capstone MVP Boundary & Productionization Policy](baseline/CAPSTONE-MVP-BOUNDARY.md)는 Baseline 아래의 Normative Scope 문서다. 법률·실환자·실병원 Productionization 과제와 Synthetic/Test P0 Technical MVP를 분리하고, 개발 우선순위와 요구사항 분류를 강제한다.

구현 전 문서 진행순서는 다음으로 고정한다.

`Baseline → Capstone Boundary → Requirements v3 → Security Requirements → Traceability Matrix → Architecture/ERD/API 정렬 → Acceptance Criteria → P0 Implementation Master Plan → Codex 구현`

- [Highpass v3 Requirements Definition](requirements/highpass-v3-requirements-definition.md)
- [Highpass v3 Security Requirements](security/highpass-v3-security-requirements.md)
- [Highpass v3 Traceability Matrix](traceability/highpass-v3-traceability-matrix.md)
- [Highpass v3 Architecture Alignment](architecture/HIGHPASS-V3-ARCHITECTURE-ALIGNMENT.md)
- [Highpass v3 Logical ERD](data/highpass-v3-erd.md)
- [Highpass v3 API Alignment](api/HIGHPASS-V3-API-ALIGNMENT.md) / [Target OpenAPI](api/highpass-v3.openapi.yaml)

위 v3 정렬 산출물은 목표 계약을 문서 수준에서 일치시킨 것이다. 실행 DB migration, 서버 endpoint, UI adapter와 DICOM data plane은 아직 변경하지 않았고 `NOT VERIFIED`다. 다음 단계는 이 산출물의 Architecture/Data/API/Security 검토 후 Acceptance Criteria를 확정하는 것이다.

핵심 흐름은 `Identity → Exchange Session → Consent/Authorization → Imaging Package → Route → Access/Transfer → Provenance → Audit`다. Source Hospital PACS가 Source of Record이고, Cloud는 Temporary Exchange Copy를 처리하는 Medical Imaging Exchange Broker다.

## 기준선 결정

| 구분 | 문서 | 역할 | 현재 판정 |
|---|---|---|---|
| 현행 실행 baseline | [v2.1 통합 요구사항](requirements/highpass-v2.1-integrated-requirements-definition.md) | 원격 DICOMweb 조회·동의·정책·토큰·감사 흐름 보존 | 구현·시험 자산 유지 |
| 호환 확장 자산 | [Mobile-Core 요구사항](requirements/highpass-mobile-core-requirements-definition.md) | Device·암호화 Package·QR Handoff·Key Release | v3 P1/공통 package 자산으로 재분류 |
| 목표 설계 baseline | [Highpass v3 Baseline](baseline/HIGHPASS-V3-BASELINE.md) | PatientRef/Mapping·ExchangeSession·ConsentArtifact·Grant·ImagingPackage·Route·Provenance | 문서 정렬 완료 / 통합 검토 필요 |

v2.1은 현행 실행·회귀 기준으로 보존한다. Mobile-Core는 삭제하지 않고 route-neutral ImagingPackage와 v3 P1 Mobile Secure Vault의 호환 자산으로 사용한다. 제품 목표는 Highpass v3 Baseline 하나로 통합하며, PM·의료정보·보안·법무 검토 전에는 production 승인이나 법률 적합성 근거로 사용하지 않는다.

## 범위 원칙

- 실제 환자정보·실제 병원망·운영 PACS·운영 IdP/KMS는 범위에서 제외합니다.
- 원본 DICOM은 A 병원 PACS/Orthanc에 유지하고 Control Plane에 지속 저장하지 않습니다.
- 모바일 경로를 채택할 경우 평문 DICOM이 아닌 암호화 Package만 저장합니다.
- QR에는 PHI, DICOM, 복호화 키, 장기 인증정보를 넣지 않습니다.
- `FR-001~FR-046` 개별 원문은 저장소에 없으므로 기능군 기준 추적만 확정하고, 원문 확보 후 항목별 승인을 갱신합니다.

## 승인 기록

| 항목 | 값 |
|---|---|
| 결정 | v3 목표 설계 기준선 수립; 구현·운영 승인 미완료 |
| 승인자 | PM / 지도교수 / 의료정보·보안 검토자 |
| 승인일 | Architecture Review에서 결정 필요 |
| 변경 절차 | ADR 갱신 및 영향범위 검토 후 승인 |

상세 비교·위협·데이터 흐름·시험 추적은 [ADR-001](architecture/ADR-001-requirements-baseline.md), [THREAT-MODEL](architecture/THREAT-MODEL.md), [DATA-FLOW](architecture/DATA-FLOW.md), [추적성 매트릭스](traceability/requirements-to-tests.md)를 참조합니다.
