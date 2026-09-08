# ADR-001: 요구사항 기준선과 Mobile-Core 도입 방향

상태: **PROPOSED / 승인 대기**  
작성일: 2026-09-07

## 문맥

v2.1은 동의 기반 원격 DICOMweb 조회를 중심으로 하고, v3 Mobile-Core는 모바일 암호화 Package·Device·QR Handoff·Key Release를 P0로 확장합니다. 두 문서 모두 Draft이며 기존 FR-001~046 원문은 저장소에 없습니다.

## 비교

| 관점 | v2.1 현행 MVP | v3 Mobile-Core Target |
|---|---|---|
| 핵심 범위 | 동의→정책→단기 토큰→QIDO/WADO→Viewer | 위 흐름 + Device·Package·QR Handoff·키 릴리스 |
| 현재 구현 | 대부분 코드·자동시험 존재 | OpenAPI/DDL/Schema/계획 중심, 실행 코드 없음 |
| 추가 구현량 | 검증·문서 정리 중심 | DB·암호·모바일·Edge·키·E2E 대규모 |
| 개인정보 위험 | 원본은 PACS 유지, 최소 메타데이터 | 분실·백업·루팅·키·재전송 위험 증가 |
| 시연 가능성 | 로컬 Docker에서 높음 | 모바일 기기/키 환경 의존, 현재 낮음 |
| 운영 확장성 | 원격조회 중심으로 단계적 확장 | 매체 기반 전송 요구까지 충족하나 외부 KMS/IdP 필수 |

## 결정 제안

v2.1을 **현행 MVP baseline으로 보존**하고, v3 Mobile-Core를 **최종 Target baseline으로 채택**합니다. v3의 P0 승격은 승인 이후에만 유효합니다. 두 버전을 병렬로 승인된 기준선으로 운영하지 않습니다.

## 결과

- 승인 전에는 모바일 실행 코드와 v3 migration을 변경하지 않습니다.
- 기존 MVP 회귀·E2E를 v2.1 기준으로 먼저 고정합니다.
- 승인 후에만 Device→Package/Crypto→Handoff→Key Release 순으로 수직 슬라이스를 구현합니다.
- 실제 병원·IdP·KMS·PACS 연동은 별도 Staging 승인 없이는 수행하지 않습니다.

## 승인

| 역할 | 승인자 | 상태 |
|---|---|---|
| PM | 결정 필요 | PENDING |
| 지도교수 | 결정 필요 | PENDING |
| 의료정보·보안 검토자 | 결정 필요 | PENDING |
