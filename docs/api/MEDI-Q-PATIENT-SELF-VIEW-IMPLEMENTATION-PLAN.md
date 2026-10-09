# Medi Q 환자 본인 실영상 연결 — 구현 계약 및 진행 계획

2026-10-09 · USER-ADOPTED S1 / IMPLEMENTATION IN PROGRESS · 신규 증적 DRAFT / UNASSIGNED

HTTP 후속: `server.js`에 별도 default-off handler와 전용 nonowner PG runtime guard를 연결했다. 실제 JWT/DPoP/ingress 서명·SQL ledger/audit를 loopback HTTP에서 검증했고10항목 PASS(21.867초)다. JSON2048byte/body5초, no-store/no-referrer, 안전한 오류, 무인증 거부 감사 실패503을 적용했다. `highpass-phr.openapi.yaml`에 capstone TEST bearer scheme·별도 발급 계약을 반영했다. 실제 profile 활성 startup/DB login role·public TLS edge·배포·Gateway 소비는 아직 NOT VERIFIED다. 다음은 patient-dicomweb 검증/범위 제한·live authority/ledger 검증이며, 발급 성공을 실제 영상 열람 완료로 승계하지 않는다. 아래 “HTTP route 미구현”은 이전 단계 설명이다.

최신 구현: `patient-self-view-grant-service.js`의 내부 발급 서비스는 existing persistent DPoP verifier·소유 reader·atomic ledger/audit에 연결됐다. 기본 비활성, body 단일Series/추가 속성 거부, 고정 HTTPS origin/path, 별도 audience/cnf, TTL≤300초·auth expiry, token hash 저장과 COMMIT 뒤 반환이다. 실제 독립 PostgreSQL에서 signed EC proof·nonce 저장·Grant 서명/hash·재사용/누락/위조·adapter restart·replay outage를 시험했다. 이는 내부 호출 검증이며 HTTP route·Gateway 소비·환자 Key Vault release·실제 웹 픽셀은 여전히 미구현/미검증이다. 기존 서명 KeyProvider를 Key Vault signer로 주장하지 않는다. 다음은 기존 인증/ingress 계약에 발급 HTTP를 연결하고 정상·거부를 검증하는 것이다. 아래 과거 단계 설명의 미구현 상태는 해당 시점으로 한정한다.

S1의 경로·authority/audience·최신 소유권 재검증·키 발급 분리 계약은 `MEDI-Q-PATIENT-SELF-VIEW-GRANT-CONTRACT.md`에 구체화했고 사용자가 “권고안 실행”으로 채택했다. 기본 비활성 DB authority reader와 명시적 계정/ref projection migration033, grant ledger migration034, 내부 저장 repository 및 기존 감사 chain transactional adapter를 로컬 구현했다. 아직 실제 DB 통합·runtime 연결/등록·DPoP 발급 API·patient data plane/key release·실제 웹/모바일 픽셀은 미완료이며 기존 doctor token 경로를 활성화하거나 완화하지 않았다.

저장 repository는 현재 계정/ref/검사/Series/기관을 `FOR SHARE`로 잠그고 소유 revision을 대조한 뒤, bound INSERT와 주입된 transactional 감사 writer를 같은 트랜잭션에서 실행한다. 감사 영수증·기한을 확인한 후 COMMIT하며 실패/timeout에는 성공 영수증이나 토큰을 반환하지 않는다. 기존 hash builder와 saveQueue를 재사용하는 `patient-self-view-audit-adapter.js`를 구현했다. DB 감사 chain head와 메모리 head를 비교하고 DB COMMIT 뒤에만 메모리와 baseline에 게시한다. commit outcome unknown이면 후속 저장을 차단하고 재시작/reload를 요구한다. singleWriter/default-off이며 실제 격리 DB 통합 검증 전 runtime 연결 금지. mock 테스트는 실제 global DB hash chain 연결 증거가 아니다. raw token은 repository 입력·저장·출력에 없다.

2026-10-09 후속: `verify-patient-self-view-postgres.js`의 실제 독립 DB/tmpfs 시험에서 정상/rollback/소유 변경/동시 save/다른 Series·role/감사 UPDATE 권한 없음6항목 PASS(21.156초)다. migration035 fixed audit-lock 함수는 PUBLIC 실행 권한 없이 별도 writer에 EXECUTE만 준다. 실제 reader·repository·global 감사 내용을 DB에서 재조회하여 검증했다. 이전 mock-only/통합 NOT VERIFIED 설명은 그 시점 이력이다. Cloud 적용·실제 최소권한 activation role 검토·DPoP 발급 API·디스크 장애내구성은 여전히 미완료이며 runtime 비활성이다.

033의 legacy snapshot 테이블 외래키는 제거했다. 현행 full save의 `TRUNCATE CASCADE`로 명시적인 account/ref/grant가 삭제되는 것을 방지하되 매 접근의 live JOIN/소유권 확인은 유지한다. 033+034는 로컬 PostgreSQL 격리 schema에서 DDL·5분 TTL·DPoP thumbprint 제약 및 legacy TRUNCATE 후 새 ledger 보존을 확인하고 전체 ROLLBACK했다. Cloud migration이나 DB repository 종단 시험을 수행한 것은 아니다.

## 확인된 현행 계약

- POST /api/patients/{patient}/studies/{study}/self-view는 서버에서 PATIENT 주체·동일 patient ID와 Study 소유권을 확인하고 PATIENT_SELF_VIEW 감사를 기록한다. 반환값은 최소 검사 메타데이터와 감사 세션이며 영상·DICOM 접근 토큰이 아니다.
- 환자 웹·모바일은 이 영수증 후 canvas 모의 그림을 표시한다. 본인 실제 영상 기능은 미구현이다. service 반환의 totalSlices는 일부 경로에서 50 fallback이 남아 있으며 실제 SOP 개수 증거로 사용할 수 없다.
- /api/dicom-access/request는 의료진 주체와 기관을 확인한다. DICOM token, data-plane signed receipt, key release는 doctorId·consentId·targetHospitalId를 함께 결속하고 매 요청 재검증한다.
- B 포털은 API 메타데이터를 Cloud로, /dicomweb/ 영상 요청을 A Gateway로 전달한다. 암호화 영상은 기존 실제 Key Vault 기반 release 검증 후 B에서 복호화한다. Cloud로 원본 영상 경로를 추가하면 안 된다.

관련 파일: src/server.js, src/services.js, src/data-plane-authorization.js, src/consent-bound-key-release.js, src/capstone-b-portal.js, public/app.js, public/mobile/app.js.

## 구현 원칙

1. 의료진 JWT나 의료진용 단기 토큰을 환자 화면에 주입하지 않는다. 본인 열람을 병원 간 동의로 위장하거나 자동 생성하지 않는다.
2. 환자 본인 주체·계정 상태·현재 Study 소유권·원본 기관 ACTIVE·허용 Series/Instance를 서버에서 확인한다. 누락·불일치·DB 장애는 fail closed.
3. 본인 열람과 병원 간 공유의 authority 타입·audience·검증 경로를 분리한다. 환자 토큰을 의료진 요청에 사용하거나 반대로 사용하는 음성 테스트가 필수다.
4. 환자용 grant는 VIEW_ONLY, 단일 Study와 명시적 Series, 짧은 TTL, DPoP key binding, auditSessionId와 tokenId를 포함한다. raw DEK·토큰·UID·내부 오류를 UI/URL/storage에 노출하지 않는다.
5. 원본은 A PACS에 유지한다. 본인 영상 전송은 A→B의 별도 제한된 patient data-plane 경로에서 이루어지고 Cloud에는 정책·최소 메타데이터·감사만 둔다.
6. 암호화 package와 Key Vault release를 환자 authority에 다시 결속한다. 기존 doctor/consent 검증을 무조건 허용하도록 완화해 재사용하지 않는다. raw key 반환·평문 fallback 없음.

## 권장 작업 단위

| 단위 | 산출물 / 완료 기준 |
|---|---|
| S1 계약 정렬 | 기존 self-view 영수증은 보존하고 별도 grant 발급·검증 계약, audience·권한·오류·감사 필드 정의. 기존 OpenAPI와 충돌 검사 |
| S2 소유권·grant | 순수 정책 서비스와 명시적 저장 경로. 본인/타인/다른 Study·Series/중지 기관/만료/증적 부재 거부 테스트 |
| S3 병원 data plane·키 발급 | 제한된 환자 경로, 실시간 소유권 재검증, package/hash binding, 재사용·변조·Vault 장애 차단. Cloud 임상 바이트 차단 유지 |
| S4 환자 웹 연결 | 실제 인증된 Instance/Frame만 lazy load. 모의 그림을 성공 대체로 사용하지 않음. 만료·잠금·컨텍스트 변경 시 blob/pixel/cine 정리 |
| S5 모바일 연결 | 동일 계약 재사용. 실제 12 SOP와 CT/MR 픽셀, 본인 접근·타인 거부, QR 공유와 별도 권한임을 검증 |
| S6 배포·증적 | 역할별 후보 hash·scan·rollback, 실제 Key Vault·감사 chain·브라우저 정상/음성·문서 검토 |

## 남은 불확실성

- 환자 authority ledger를 기존 token log에 명시적 actor 타입으로 확장할지 별도 저장할지 아직 결정하지 않았다. 기존 의료진 claims를 환자에 억지로 맞추지 않는다.
- 환자용 prefix/API 명칭은 기존 Gateway parser·ingress deny 규칙·Key Release 계약의 영향을 확인한 뒤 S1에서 고정한다. 이 문서만으로 현재 라우트를 허용했다고 주장하지 않는다.
- 기존 v3 Identity/Mapping/Grant와의 장기 통합은 별도 작업이다. 이번 캡스톤 합성 환자 profile을 운영 본인확인으로 표시하지 않는다.

완료 증거는 합성 팬텀 환자의 CT·MR 각각 12장·256×256 실제 브라우저 열람, 같은 grant·암호화 release·감사 연결, 타인/범위/만료·키 장애 음성이다. canvas 모의 그림이나 현재 의료진 PASS로 이 기능을 완료 처리하지 않는다.
