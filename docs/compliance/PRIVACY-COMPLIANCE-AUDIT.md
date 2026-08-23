# Privacy and Medical Information Compliance Audit

기준일: 2026-07-11  
대상: 하이패스 Platform 현재 로컬 프로젝트

## Executive Summary

현재 구현은 환자 동의, Study/Series 범위 제한, 단기 토큰, Gateway 검증, 감사로그, 연구용 가명처리 시뮬레이션을 갖춘 폐쇄형 MVP이다. 그러나 실환자 데이터 또는 실제 병원 운영 환경에 투입하기에는 인증·인가, 감사로그 보호, OHIF 우회 경로, 보관·파기, 법적 역할 정의가 부족하다.

최종 판정: **READY FOR CLOSED POC ONLY**  
실환자 데이터·운영 배포 판정: **NOT READY FOR REAL PATIENT DATA**

## High-Risk Findings

| 등급 | 항목 | 근거 | 영향 | 조치 |
|---|---|---|---|---|
| P0 | API 인증 부재 | `src/auth.js`, `src/server.js`에서 mock principal binding 추가 | 실운영 IdP는 아직 없음 | 실제 IdP 연동 |
| P0 | 감사로그 API 보호 미흡 | `POST /api/audit-logs` 내부서비스 전용, `GET` 관리자 전용 | 개발 mock 인증에 의존 | 운영 인증 적용 |
| P0 | OHIF 직접 Orthanc 설정 | `ohif/app-config.js`가 Gateway `/dicomweb` 참조 | OHIF 토큰 주입은 별도 검증 필요 | Viewer token 전달 검증 |
| P1 | Orthanc 인증 비활성 | host port 미공개, OHIF 직접 접근 제거 | Orthanc 자체 인증은 미구현 | 인증 또는 mTLS |
| P1 | 보관·파기 정책 미구현 | `src/retention.js`, `RETENTION-AND-DELETION.md` 추가 | 실제 삭제는 dry-run | 법무 승인 후 enforce |
| P1 | 가명 매핑 보호 부족 | protected ref/key provider marker 추가 | 실제 KMS 미연동 | 별도 DB/schema와 KMS |
| P1 | 침해사고 대응 체계 부재 | `INCIDENT-RESPONSE-RUNBOOK.md` 추가 | 실제 조직 프로세스 미검증 | 병원·법무 승인 |
| P2 | `innerHTML` 사용 패턴 | `public/app.js` 렌더링에 사용 | 향후 XSS 회귀 위험 | 안전 렌더링 helper 강제 및 테스트 |

## Compliance Mapping

| 영역 | 현재 충족 | 미흡 |
|---|---|---|
| 환자 동의 | 동의 상태, 목적, 기간, Study/Series scope 구현 | 법정 동의서 문구·버전·철회 고지 부족 |
| 민감정보 최소화 | 원본 DICOM Control Plane 미저장 | 환자 연락처·생년월일 필요성 재검토 |
| 접근통제 | RBAC+ABAC 정책 엔진, Fail Closed | 실제 인증 principal 미연계 |
| 단기 토큰 | 5~10분 TTL, Study/Series/병원/권한 claim | 키 회전·운영 secret 관리 미구현 |
| Gateway | 토큰 검증, no-store WADO 응답 | Viewer 직접 Orthanc 설정 정리 필요 |
| 감사로그 | 표준 필드, hash chain, 수정/삭제 차단 | 조회/생성 API 권한통제 미흡 |
| 가명처리 | DICOM header 정제, 판독문 마스킹, 반출 승인 | 재식별 위험평가·심의 절차 미구현 |
| 연구용 반출 | REQUESTED/APPROVED/REJECTED 흐름 | 실제 승인자 인증·반출 파일 통제 미흡 |

## Verified Technical Evidence

- `node --test`: PASS, 39 tests passed.
- `GET /api/health`: PASS, `database: UP`.
- Docker services observed running: Control API, PostgreSQL, Orthanc, OHIF.
- Control Plane 원본 DICOM 지속 저장: 코드 기준 NO.

## Not Verified

- 실제 병원 PACS 연동
- 실제 환자 동의서 법무 검토
- TLS, WAF, mTLS, KMS, HSM
- 클라우드 운영 접근통제
- 백업 암호화와 파기
- 전자의무기록 외부보관 인프라 인증
- EMR 인증 적합성
