# Third-Party and Processor Map

기준일: 2026-07-11

| 서비스 | 제공자 | 데이터 | 목적 | 저장위치 | 국외 이전 가능성 | 계약 검토 필요 |
|---|---|---|---|---|---|---|
| PostgreSQL | Docker local `postgres:16-alpine` | Control Plane DB | 로컬 PoC 저장 | local Docker volume | NOT VERIFIED | YES |
| Orthanc | Docker image `jodogne/orthanc-plugins` | 샘플 DICOM | 가상 PACS | local Docker volume | NOT VERIFIED | YES |
| OHIF Viewer | Docker image `ohif/app:v3.9.2` | DICOMweb 조회 결과 | Viewer | browser/runtime | NOT VERIFIED | YES |
| Node.js Control API | Local container | 동의, 토큰, 감사로그 | Control Plane | local Docker/container | NOT VERIFIED | YES |
| Cloud provider | NOT CONFIGURED | 미정 | 운영 인프라 | NOT VERIFIED | NOT VERIFIED | YES |
| CDN | NOT CONFIGURED | 미정 | 정적 리소스 | NOT VERIFIED | NOT VERIFIED | YES |
| Monitoring/Error tracking | NOT CONFIGURED | 로그 가능성 | 운영 관측 | NOT VERIFIED | NOT VERIFIED | YES |
| Email/SMS | NOT CONFIGURED | 연락처 가능성 | 통지 | NOT VERIFIED | NOT VERIFIED | YES |
| Authentication Provider | NOT CONFIGURED | 사용자 식별자 | 인증 | NOT VERIFIED | NOT VERIFIED | YES |
| Backup | NOT CONFIGURED | DB/로그 가능성 | 복구 | NOT VERIFIED | NOT VERIFIED | YES |

## 주의

현재 표는 로컬 PoC 구성 기준이다. 실제 운영 환경에서는 클라우드 리전, 하위수탁자, 국외 이전, 암호화, 파기, 접근권한, 감사권을 계약 단위로 확인해야 한다.
