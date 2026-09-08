# Highpass 요구사항 기준 문서

상태: **승인 대기 (`DRAFT / UNASSIGNED`)**  
기준일: 2026-09-07

## 기준선 결정

| 구분 | 문서 | 역할 | 현재 판정 |
|---|---|---|---|
| 현행 MVP baseline | [v2.1 통합 요구사항](requirements/highpass-v2.1-integrated-requirements-definition.md) | 원격 DICOMweb 조회·동의·정책·토큰·감사 흐름 보존 | 제안 |
| Target baseline | [Mobile-Core 요구사항](requirements/highpass-mobile-core-requirements-definition.md) | Device·암호화 Package·QR Handoff·Key Release 확장 | 승인 대기 |

권고안은 v2.1을 현행 MVP baseline으로 보존하고 v3 Mobile-Core를 최종 Target baseline으로 채택하는 것입니다. 두 문서를 동시에 승인된 기준선으로 운영하지 않습니다. PM, 지도교수, 의료정보·보안 검토자의 승인 전에는 이 결정은 공식 기준선이 아닙니다.

## 범위 원칙

- 실제 환자정보·실제 병원망·운영 PACS·운영 IdP/KMS는 범위에서 제외합니다.
- 원본 DICOM은 A 병원 PACS/Orthanc에 유지하고 Control Plane에 지속 저장하지 않습니다.
- 모바일 경로를 채택할 경우 평문 DICOM이 아닌 암호화 Package만 저장합니다.
- QR에는 PHI, DICOM, 복호화 키, 장기 인증정보를 넣지 않습니다.
- `FR-001~FR-046` 개별 원문은 저장소에 없으므로 기능군 기준 추적만 확정하고, 원문 확보 후 항목별 승인을 갱신합니다.

## 승인 기록

| 항목 | 값 |
|---|---|
| 결정 | 미승인 |
| 승인자 | PM / 지도교수 / 의료정보·보안 검토자 |
| 승인일 | 결정 필요 |
| 변경 절차 | ADR 갱신 및 영향범위 검토 후 승인 |

상세 비교·위협·데이터 흐름·시험 추적은 [ADR-001](architecture/ADR-001-requirements-baseline.md), [THREAT-MODEL](architecture/THREAT-MODEL.md), [DATA-FLOW](architecture/DATA-FLOW.md), [추적성 매트릭스](traceability/requirements-to-tests.md)를 참조합니다.
