# Medi Q 환자 본인 실영상 — S1 계약 및 기초 정책

2026-10-09 · DRAFT / UNASSIGNED · 로컬 구현 / 런타임 비활성

## 목적과 기존 구조

환자 self-view API는 현재 소유 검사 감사·메타데이터만 반환하며 웹/모바일은 canvas 모의 그림을 표시한다. 의료진 DICOM token/data-plane receipt/Key Vault release는 doctorId·consentId에 결속돼 있다. 본인 열람에 의료진 identity나 가상 동의를 삽입하지 않고 별도 authority를 구현하기 위한 S1 계약과 S2의 기초 정책을 작성했다.

관련 FR: 006~013, 021~025, 026~036, 037~041. 기존 API·DB·인증·Gateway는 변경하지 않았다.

## 산출물

- docs/api/MEDI-Q-PATIENT-SELF-VIEW-GRANT-CONTRACT.md: 새 grant API·patient data-plane 경로·별도 audience/ledger·키 발급 결속·정상/음성 검증 계약. 제안 상태이며 운영 승인이나 런타임 활성화가 아니다.
- src/patient-self-view-policy.js: 신뢰된 서버-side reader의 최신 snapshot을 입력받는 순수 기초 정책. PATIENT 주체, 동일 환자, 명시적 account/ref 검증 증거, ACTIVE, Study/Series 소유권·현재 revision·기관 상태와 VIEW-only를 확인한다. doctorId·consentId·토큰은 반환하지 않는다.
- test/patient-self-view-policy.test.js: 본인 단일 Series 허용, role 행세/다른 환자/다운로드·반입 거부, 증거 누락/중지/소유권 변경/기관 불일치 거부, UID·Series 중복/누락/잘못된 snapshot 거부.

## 보안 경계와 검증

기초 policy는 자체 인증 provider·DPoP·durable ledger·감사·시간제 토큰을 구현한 것이 아니다. caller가 보낸 snapshot은 금지이며 실제 구현에는 인증 provider 및 최신 authority reader가 필요하다. pure policy ALLOWED를 Gateway/Key Vault 허용으로 직접 사용하지 않는다. 정책 reader 부재는 미검증/발급 거부다.

현재 legacy patient 행에 account status가 없음을 확인했으므로 존재 여부를 ACTIVE 증거로 간주하지 않는다. 별도 capstone Mock IdP 고정 profile adapter 또는 실제 v3 account/ref reader가 후속 필요하다. 키 release는 기존 doctor 경로를 완화하지 않고 별도로 구현한다.

기초 policy 선택 테스트 4/4 PASS, exit 0. 이는 서버 인증·실제 HTTP·PostgreSQL·Key Vault·브라우저 본인 픽셀을 검증한 결과가 아니다. 신규 파일은 VM/Azure에 배포하지 않았다.

현재 코드 기준 전체 Node 회귀 770/770 PASS, fail 0, exit 0, 42.438초. 실제 환경 별도 HTTPS/브라우저/보안 게이트를 대신하지 않는다.

## 다음 구현 단위

1. server-side authority reader 및 capstone profile 활성 증거 adapter: 최신 원본 ref/소유권 조회, 저장소 장애 차단.
2. 별도 grant ledger·발급 서비스·DPoP와 durable 감사·짧은 TTL. OpenAPI/DDL/ERD 정렬.
3. A/B의 제한된 patient 영상 경로와 해당 authority의 Key Vault package/hash 재검증.
4. 웹·모바일 실제 CT/MR 픽셀 lazy loading·만료/잠금 제거.
5. 역할별 이미지 검사·배포·rollback·전체 정상/음성 브라우저 증적.

환자 본인 실영상, 전체 MVP/v3 완료는 미완료다. commit/push 없음.
