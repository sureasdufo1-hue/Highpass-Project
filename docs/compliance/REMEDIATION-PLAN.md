# Compliance Remediation Plan

기준일: 2026-07-11

## Phase 0: 실환자 데이터 차단 유지

- 실제 환자 개인정보, 실제 병원망, 실제 PACS 연결 금지
- 샘플 DICOM과 가상 병원 A/B/C만 사용
- 데모 환경에 `POC_ONLY=true` 같은 명시적 표시 추가 검토

## Phase 1: 인증·인가 보강

1. 모든 민감 `/api/*`, `/gateway/*`에 principal 검증 적용: IMPLEMENTED
2. 요청 본문의 `doctorId`, `patientId`, `hospitalId`를 인증 principal과 서버에서 매핑: IMPLEMENTED
3. 역할별 API 권한 matrix 작성: PARTIAL
4. `POST /api/audit-logs`는 내부 서비스 계정 전용으로 제한: IMPLEMENTED
5. `GET /api/audit-logs`, `/api/anomaly-alerts`, `/api/audit-integrity`는 보안 관리자 중심으로 제한: IMPLEMENTED
6. 실제 IdP/JWT/SSO 연동: NOT VERIFIED

## Phase 2: Gateway 우회 차단

1. OHIF 설정을 Orthanc 직접 URL이 아닌 Gateway DICOMweb URL로 변경: IMPLEMENTED
2. Orthanc host port 비공개 유지: IMPLEMENTED
3. Orthanc 인증 또는 mTLS 적용
4. Gateway에서 모든 QIDO/WADO 요청의 토큰 scope 재검증

## Phase 3: 개인정보보호 운영정책

1. 데이터 항목별 보존기간과 파기 정책 작성
2. 환자 동의서 버전, 고지문, 철회 절차 관리
3. 정보주체 권리 요청 처리 절차 작성
4. 위탁·재위탁 계약 항목 정리
5. 개인정보 유출 통지·신고 runbook 작성

## Phase 4: 가명정보 보호

1. `pseudonym_mappings`를 별도 schema 또는 DB로 분리
2. 매핑 테이블 암호화와 접근권한 분리
3. 연구 반출 승인자 인증과 이중 승인 검토
4. 재식별 위험 평가 체크리스트 작성
5. 안면 CT/3D 영상은 defacing 미구현 시 반출 차단 유지

## Phase 5: 운영 보안

1. TLS 종단, mTLS 또는 서비스 간 인증
2. 비밀정보 KMS/Vault 관리와 키 회전
3. DB 암호화, 백업 암호화, 백업 파기
4. rate limit, audit alert, SIEM 연계
5. 취약점 점검과 침투테스트

## Pilot Gate

실제 병원 파일럿 전 최소 조건:

- 인증 principal 기반 접근통제 PASS
- 감사로그 생성/조회/무결성 권한통제 PASS
- OHIF Gateway 경유 조회 PASS
- 보관·파기 정책 문서화 및 자동화 설계 PASS
- 병원/하이패스/클라우드 법적 역할 확정
- 법무·개인정보보호책임자 승인
