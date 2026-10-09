# Medi Q 환자 본인 열람 Grant 계약

2026-10-09 · S1 USER-ADOPTED CONTRACT / IMPLEMENTATION IN PROGRESS

사용자의 “권고안 실행”으로 S1 구현 방향을 채택했다. 별도 환자 authority/ledger/audience·명시적인 합성 계정/ref 증거·A 원본 유지·실제 Key Vault 경로를 적용한다. 이는 구현 방향 승인이지 신규 테스트 증적의 독립 사람 검토·운영 승인이나 구현 완료가 아니다. 신규 증적은 계속 DRAFT / UNASSIGNED다.

## 목적과 적용 범위

기존 환자 소유 검사 목록과 self-view 감사 영수증을 실제 합성 DICOM 열람으로 연결하기 위한 별도 계약이다. 기존 병원 간 Consent/Doctor 토큰·v3 TransferGrant를 대체하지 않는다. FR-006~013, FR-021~025, FR-026~036, FR-037~041에 영향을 준다. 법적 본인확인·운영 승인·네이티브 앱 완료 주장이 아니다.

확인된 요구사항: 환자가 자신의 합성 CT/MR만 실제 픽셀로 열람한다. 원본은 A PACS에 유지하고 Cloud는 임상 영상 바이트를 전달하지 않는다. 최소 범위, DPoP, 실제 Key Vault 암호화, 재검증과 감사가 필요하다.

합리적 가정: B의 공개 포털/Gateway는 캡스톤에서 환자 웹 전달 지점도 담당한다. 이는 B 의료진에게 환자 영상을 열람할 권한을 부여하는 것이 아니다. 병원 간 공유에는 기존 별도 동의·권한이 계속 필요하다.

## API 및 경로

| 변경 전 | 변경 후 제안 | 영향 |
|---|---|---|
| POST /api/patients/{patientId}/studies/{studyUid}/self-view | 기존 메타데이터·감사 계약 유지 | 구형 클라이언트 동작 보존; 실제 영상 권한으로 오인 금지 |
| 본인 DICOM grant 없음 | POST /api/patients/{patientId}/studies/{studyUid}/self-view-grants | PATIENT 인증·정확한 주체 결속·서버 소유권·DPoP 검증 후 신규 단기 grant |
| 의료진 /dicomweb/* | 별도 /patient-dicomweb/* | B→A 병원 data plane 전용, Cloud clinical 경로는 계속 차단 |
| 의료진 consent-bound key release | 별도 patient-self-view key release | 명시적 authority 타입·별도 ledger·patient actor/audience 검증. 기존 doctor 검증 우회 없음 |

신규 경로는 기본 비활성이다. 이 문서만으로 ingress·API·Gateway에 활성화하지 않는다. 사용 가능한 경로는 Study/Series/Instance 목록과 단일 Instance rendered/frame 열람만이다. bulk/download/STOW/연구반출 금지. parse와 UID 검증은 기존 DICOM parser 규칙을 재사용하되 patient prefix를 명시적으로 구분한다.

발급 body는 `{ "seriesInstanceUids": ["<UID>"] }`이며 추가 속성을 거부한다. patientId·studyUid는 path에서, actor·소유권·출처·권한·기간·audience는 서버에서 결정한다. doctorId·consentId·수신기관·임의 URL·permission·purpose·expiresAt를 caller가 주입하지 못한다. 최초 MVP는 Series 한 개씩 발급한다.

## 서버 정책 입력과 판정

신뢰 가능한 인증 provider와 정책 reader가 제공한 최신 snapshot만 사용한다. 브라우저가 제공한 status/owner/기관 값은 증거가 아니다.

1. PATIENT role, 동일 path patientId, 유효한 현재 인증 세션.
2. 현재 account ACTIVE 증거, subject와 patient 소유 ref 결속, ref가 삭제·변경되지 않았음.
3. 정확한 Study 소유권, 원본 기관 ACTIVE, 해당 Series가 Study에 존재하고 유효한 UID.
4. 요청 DPoP issuance proof의 htm/htu/jti/iat/public JWK, 공유 PG replay 검증.
5. 고정된 viewing Gateway allowlist 및 서로 다른 서비스 주체/credential 경계.
6. 감사와 grant ledger의 durable 쓰기 성공. DB/audit/proof 저장소 장애 시 토큰 미발급.

현행 legacy patients 행에는 account status 필드가 없다는 점을 확인했다. 존재 여부를 ACTIVE로 간주하지 않는다. capstone Mock IdP의 고정 합성 profile 활성 증거 adapter 또는 v3 account/ref reader를 명시적으로 구현해야 한다. adapter 미구현·미확인 상태는 NOT VERIFIED/발급 거부다.

대표 거부: AUTHENTICATION_REQUIRED, PATIENT_SUBJECT_MISMATCH, PATIENT_ACCOUNT_UNVERIFIED, PATIENT_ACCOUNT_INACTIVE, PATIENT_OWNERSHIP_UNVERIFIED, PATIENT_OWNERSHIP_CHANGED, SOURCE_HOSPITAL_INACTIVE, SCOPE_MISMATCH, DPOP_REQUIRED/INVALID, AUTHORITY_PERSISTENCE_UNAVAILABLE. 타인 Study 존재 여부는 사용자 응답에 공개하지 않는다.

## 단기 토큰 및 ledger

- authorityType: PATIENT_SELF_VIEW, actorType: PATIENT.
- iss: highpass-control-plane; aud: mediq-patient-self-view-gateway. 기존 의료진 audience와 교차 사용 거부.
- jti, subject, patientId, sourceHospitalId, viewingGatewayId, studyInstanceUid, allowedSeriesUids, permission=VIEW_ONLY, purpose=PATIENT_SELF_VIEW, iat/exp, auditSessionId, cnf.jkt.
- TTL 최대 5분, 인증 세션 잔여기간보다 길지 않음. client 입력으로 늘리지 않음.
- 별도 patient grant ledger: token hash, 정확한 authority scope, status ACTIVE/REVOKED/EXPIRED, expiry, ownership revision, 감사 세션. raw token/키/영상 저장 없음. 기존 doctorId·consentId 필드에 가상 의료진/가상 동의를 만들어 넣지 않는다.
- 발급 응답의 accessToken은 RAM 전용. URL/storage/일반 로그 비노출. 부가 응답은 expiresAt, permission, auditSessionId와 검사 최소 메타데이터만.

매 목록·픽셀 요청, wrap/precheck/consume 시 현재 account/ref·소유권·기관·grant 상태·Series·SOP·DPoP 결속을 다시 확인한다. 서명만 유효하면 계속 허용하지 않는다. source UID가 같은 다른 환자로 재매핑되거나 grant 철회되면 즉시 거부한다.

## 암호화·전송·클라이언트

2026-10-09 A/B transport 구현: `patient-data-plane-gateway.js`는 별도 authorize/ready와 strict bounded HTTPS를 사용한다. 명시적 patient source/Gateway/type/audience의 검증 결과만 수용하고 PACS에 browser token/proof를 전달하지 않는다. metadata는 exact Study/Series/SOP를 검사한 뒤 허용 tag/VR/Value만 전달하며 PN·생년월일·private tag·BulkDataURI 등을 제외한다. 환자 픽셀은 `sealPatient` 전용 adapter가 없으면 PACS 조회 전에503이며 기존 doctor encryptor를 재사용하지 않는다. adapter 호출에는 최대25초 deadline·abort와 transient input buffer 정리가 있다. adapter injection 시험은 실제 암호화/Vault 증거가 아니다.

A listener의 `CAPSTONE_PATIENT_SELF_VIEW_GATEWAY=1`은 별도 patient credential file/source 설정이 필요하고 기본값은0이다. 현재 listener는 metadata만 가능하도록 연결했으며 patient Key Vault adapter는 아직 없다. B portal의 patientSelfViewEnabled 역시 기본false이며 true일 때 metadata를 A에만 전달한다. patient pixel은 KeyRelease 미준비로503이며 doctor decryptor로 대체하지 않는다. B 실제 listener 설정·Cloud ingress whitelist·Docker 새 source 포함·A/B 배포는 아직 미완료/미검증이다. 기존 배포를 변경하지 않았다.

2026-10-09 준비 영수증 경계: authorize 성공 응답은 patient response preparation 전용 HMAC 영수증을 내부 Gateway에만 반환한다. raw access token/proof는 영수증에 포함하지 않으며 signed claims·token hash·정확한 GET path·signing kid와 최대30초/Grant 만료 이내 deadline에 결속한다. 별도 process-local 키로 서명하므로 재시작 시 진행 중 영수증은 거부된다. HA·정확히 한 번 처리·durable key-release 영수증을 뜻하지 않는다.

default-off `POST /gateway/patient-self-view/ready` 입력은 `{receipt, bytesPrepared, outcome}`이며 outcome은 READY/UPSTREAM_FAILURE, bytesPrepared는0~33554432다. authorize와 같은 별도 service subject/scope/source를 요구하고 서명·deadline·현재 signing key·Grant ledger·소유 ref를 재확인한다. 기존 감사 저장 후에도 현재 권한과 deadline을 재확인하며, 실패 시 accepted=false와403(정책)/503(저장·키 서비스 장애)을 구분한다. 허용 응답도 `delivery: NOT VERIFIED`다. 이미 소비한 브라우저 DPoP를 다시 사용하지 않는다. bytesPrepared는 인증된 Gateway의 보고값이지 패킷·암호문 hash·Viewer 전달 증명이 아니며, 후속 A/B 암호화 package/release 결속과 실제 브라우저 시험이 필요하다. 내부 HTTP routing·runtime 활성화·실제 A Gateway 호출은 아직 미검증이다.

로컬 구현 상태(2026-10-09): default-off `/gateway/patient-self-view/authorize`는 별도 internal credential의 `gateway:patient-self-view-authorize` scope와 source Hospital을 요구한다. 입력은 GET patient-dicomweb path·DPoP scheme/token/proof이며, 기존 parser를 재사용하되 raw Instance·download·무범위 Study 조회를 거부한다. 실제 signed patient capability/ledger hash/scope/현재 account/ref/source·DPoP ath/htu/key/nonce를 확인하고 proof 처리·감사 저장 뒤에도 live 권한을 재조회한다. 이 metadata authorization 응답은 영상 제공/Key Vault release/실제 A Gateway 전송 영수증이 아니다. 기존 doctor용 service credential은 호출할 수 없다. Cloud는 patient-dicomweb clinical prefix도 직접 차단한다. 이 단계에서 A/B byte 전달 경로는 아직 비활성이며 평문으로 대체하지 않는다.

별도 patient authority receipt를 A에서 검증한 후 단일 Instance를 암호화한다. Key Vault release는 tokenId·patient subject·source·viewingGateway·auditSession·SOP·packageId·manifest/ciphertext/wrapped-key hashes에 결속한다. 별도 ledger의 원자적 consume, 실제 Vault 장애 fail closed, 평문 fallback 금지. B 의료진용 release credential과 환자용 권한을 혼용하지 않는다.

웹·모바일은 같은 본인 인증 계약을 사용한다. Series→Instance→Frame lazy loading, 실제 응답의 SOP 개수로 슬라이더 구성. 인증·만료·잠금·scope 변경·철회 시 cine 정지와 pixel/blob/thumbnail 참조 제거. 늦은 응답은 컨텍스트/authority가 바뀌면 폐기한다. 오류를 canvas 모의 그림으로 성공 대체하지 않는다.

## 검증·산출물 완료 기준

- 순수 정책 및 실제 HTTP: 본인 허용, 타인/DOCTOR/관리자 환자 행세 거부, account/ref 증적 누락 거부, 다른 Study·Series/SOP·download 거부.
- 타입·audience·DPoP: 의료진 token↔환자 경로 교차 거부, key/nonce replay·변조·expiry·저장소 장애 거부.
- 암호화: 실제 Key Vault package/hash 결속·재사용·Vault 장애·소유권 변경 후 key release 차단.
- Cloud ingress: 새 patient clinical 경로 직접 접근 차단, A PACS 직접 접근 차단 유지.
- 브라우저 CT·MR: 각각 정확한 12 SOP·256×256·슬라이스 이동, 실제 pixel/token/release/감사 연결, 잠금·만료 후 제거.
- 신규 ledger DDL·API OpenAPI·아키텍처/ERD·추적성·Docker 역할별 설정·rollout attestation을 실제 구현과 함께 갱신.

후속 순서: 정책 reader/순수 policy → ledger·grant issuance → A/B patient data plane → patient key release → 웹/모바일 실제 픽셀 → 후보 scan·배포·종단 증적. 이 계약과 테스트 목록 자체는 구현 완료 증거가 아니다.
