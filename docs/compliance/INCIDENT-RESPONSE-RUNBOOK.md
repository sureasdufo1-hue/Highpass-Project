# Incident Response Runbook

기준일: 2026-07-11

## 목적

하이패스 Platform에서 개인정보 또는 의료영상 접근 사고가 의심될 때 초기 대응, 격리, 증거 보존, 법률 검토, 복구를 일관되게 수행한다.

## 즉시 조치

1. 사고 탐지: 이상행위 경고, AuditLog, Gateway 오류, 사용자 신고를 접수한다.
2. 초기 분류: 토큰 유출, 계정 오남용, Gateway 우회, Orthanc 노출, DB 노출, 연구 반출 오남용으로 구분한다.
3. 계정 차단: 관련 principal, 세션, 내부서비스 토큰을 비활성화한다.
4. 토큰 폐기: 영향받은 DICOMweb 토큰을 `REVOKED` 또는 `EXPIRED` 처리한다.
5. Gateway 차단: 필요 시 Gateway ingress 또는 DICOMweb 라우팅을 임시 차단한다.
6. Orthanc 격리: Orthanc 컨테이너와 Docker network 접근 범위를 제한한다.
7. Key rotation: `DICOM_TOKEN_SECRET`, 내부서비스 토큰, DB credential 회전을 준비한다.

## 증거 보존

- AuditLog hash chain을 보존한다.
- 관련 `auditSessionId`, actorId, hospitalId, studyUid, seriesUid, IP, user-agent를 별도 보존한다.
- 로그를 수정하거나 삭제하지 않는다.
- 시스템 스냅샷과 설정 파일을 읽기 전용으로 보관한다.

## 영향 범위 산정

- 영향받은 환자
- 영향받은 병원
- 노출 가능 Study/Series/Instance
- 발급된 토큰과 만료 시각
- 연구용 반출 여부
- Control Plane DB와 Orthanc 접근 여부

## 통지·신고

정확한 법정 통지·신고 기한은 사고 시점의 현행 법령과 병원 계약 기준으로 재검증한다.

상태: **CURRENT LEGAL DEADLINE VERIFICATION REQUIRED**

## 복구

1. 취약 경로 차단 확인
2. 회전된 secret 배포
3. 서비스 health check
4. 정상 접근정책 테스트
5. 감사로그 무결성 검증
6. 재발방지 과제 등록

## 사후 조치

- 원인 분석 보고서 작성
- 병원·하이패스·클라우드 책임 범위 검토
- 개인정보보호책임자 및 법무 검토
- 탐지 rule과 alert threshold 조정
