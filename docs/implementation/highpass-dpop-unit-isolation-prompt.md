# 다음 실행 프롬프트 — DPoP unit HTTP의 외부 Orthanc 의존 제거

2026-10-07. durable idempotency 검증 후 전체 회귀 timeout을 확인했다.
관련: V3-NFR-TST-001 / FIX-006 / FIX-010.

DPoP unit HTTP 테스트는 기본 hospital-a-orthanc DNS에 의존한다. 이를 명시적인 ephemeral
loopback HTTP Orthanc REST test double로 격리한다. /studies의 빈 JSON만 반환하고 영상은 제공하지 않는다.
인가된 요청만 upstream에 도달하는 count를 assert한다. 정상이므로 200을 요구하고 오류 허용 success를 없앤다.
서버의 DPoP/ingress/replay/tarpit와 timeout을 완화하지 않는다. 실제 HTTPS/mTLS/Orthanc E2E는 별도 유지한다.
unit fixture 성공을 실제 PACS/DICOM 성공으로 주장하지 않는다. 실행 실패와 재실행 결과를 보존한다.
