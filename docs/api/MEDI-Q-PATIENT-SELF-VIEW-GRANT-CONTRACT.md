# Medi Q 환자 본인 열람 Grant 계약

2026-10-09 · S1 USER-ADOPTED CONTRACT / IMPLEMENTATION IN PROGRESS

## 환자 Control 배포 준비 계약

Full-app 브라우저의 철회 검증은 UI 오류만으로 PASS를 내리지 않는다. 기존 forward 경계에서 실제 rendered 응답의 whitelist 오류 코드와 HTTP status만 관측해 `403 / PATIENT_ACCESS_DENIED`를 요구하며, 미응답·503·500·401·다른403은 정책 DENY 증거로 거부한다. PACS read 불변과 SQL hash chain/release 확인도 유지한다. 최신 증적의 `policyDenial` 필드로 관측 status/code를 확인한다. 토큰·원문 응답·키를 출력하지 않는다. 이 시험은 격리 SQL Grant 철회이며 환자 동의 철회 UI/실제 공개 ingress 전체 흐름을 대신하지 않는다.

고정 합성 소유권 등록: `scripts/register-capstone-patient-phantom.js`는 TEST/Control-only operator 전용이며 기본은 rollback-only다. 임의 사용자·환자·UID를 받지 않고 `SYNTHETIC_PHANTOM_24_SLICE_V1`의 환자/활성 HOSP-A/CT·MR Study·Series 메타데이터를 기존 `phantomCatalog`와 정확히 비교한다. 기존 계정/ref나 app/authority/bootstrap의 다른 DB 연결이 있으면 중단한다. 실제 적용은 명시적 `--apply`에서만 계정1/ref2와 기존 감사 hash chain의 이벤트1개를 같은 트랜잭션에 INSERT한다. UPDATE/upsert/기존 권한 확대/동의·Grant 발급 없음. SQL 잠금/연결 검사는 HA의 전역 정지를 증명하지 않으므로, 배포 작업자는 Control·authority writer를 정지하고 새 연결이 생기지 않는 유지보수 구간에서 실행한 뒤 기존 앱을 재로드해야 한다. 런타임 계정에 등록 INSERT 권한을 추가하지 않는다.

실제 적용 전 독립 검토와 새 이미지 source/gate 검증이 필요하다. 기존 preparation Compose profile에서 Control을 정지한 유지보수 구간에 `docker compose -f infra/azure/capstone-control.compose.yml -f infra/azure/capstone-patient-preparation.compose.yml --profile patient-preparation run --rm patient-prepare scripts/register-capstone-patient-phantom.js`로 사전검사한다. `--apply`는 승인된 변경에서만 추가한다. 전용 스키마 준비(033~036)와 합성 카탈로그가 선행되어야 하며 이번에는 실제 cloud DB에서 이 등록 명령을 실행하지 않았다. COMMIT 결과 불명 시 자동 재시도하지 않고 account/ref/audit를 재조회해 조정한다. 이미 등록된 상태는 재적용 거부하며 철회/삭제를 복구로 위장하지 않는다. 실패 rollback은 신규 트랜잭션의 변경만 되돌린다. 적용 후 복구는 기존 이미지·feature-off와 DB 보존이며 기존 감사/계정/ref를 삭제하는 명령을 제공하지 않는다.

전체 앱 격리 검증은 같은 명령에 `--full-app`을 추가하면 실제 환자 웹 로그인/검사 선택을 사용한다. `--full-app --mobile`은 실제 모바일 PWA의 서명 로그인·개발용 PIN 화면 체험·검사 선택을375px 브라우저에서 검증한다. `--mobile`은 `--full-app` 없이는 시작 전 거부하며 `--full-app`은 `--browser --phantom CT|MR`를 요구한다. CT·MR 웹/모바일 최신 결과와 실패 이력은 현재 상태 문서를 참조한다. 공개 배포 ingress·native hardware·동의 철회 UI의 완료 증거가 아니며, Grant 철회 거부는 격리 SQL 상태 변경을 사용한다. 최신 증적 DRAFT / UNASSIGNED, 독립 검토·배포 활성화/rollback은 남아 있다.

2026-10-10 검증 추가: `python scripts/patient-vault-integration-ops.py --phantom CT --browser` 및 `--phantom MR --browser`는 실제 VM-local Vault·고정 합성 PACS·격리 SQL에 공통 Viewer의 Chrome 검증을 연결한다. VM 암호는 concealed 로컬 입력에만 전달한다. `--browser` 단독 실행은 거부한다. 신뢰된 로컬 HTTPS에 자체 launcher/메모리 시험 PATIENT JWT를 제공하고 API/영상 요청은 실제 기존 handler에 전달한다. DPoP·서명 ingress·authority·release 정책을 mock PASS로 대체하지 않는다. 각 modality의 두 실제256×256 SOP와 Grant 철회 후 신규 접근 거부/PACS 읽기 불변을 확인했다. 현재 상태 문서의 신규 증적은 DRAFT / UNASSIGNED이다. 이는 실제 공개 배포 ingress·전체 환자/모바일 로그인 화면·동의 철회 API 또는12개 전체 pixel 검증이 아니다.

명시적 준비 도구 `scripts/prepare-capstone-patient-database.js`는 기본 preflight이며 `--apply`에서만 변경한다. 별도 `capstone-patient-preparation.compose.yml`의 `patient-preparation` profile은 bootstrap admin/password와 새 전용 password 파일만 준비 컨테이너에 readonly mount한다. Control에 admin key를 전달하지 않는다. 신규 소스 이미지 재빌드 후 `docker compose -f infra/azure/capstone-control.compose.yml -f infra/azure/capstone-patient-preparation.compose.yml --profile patient-preparation run --rm patient-prepare`로 preflight한다. 승인된 실제 변경 시에만 같은 명령의 서비스 뒤에 `scripts/prepare-capstone-patient-database.js --apply`를 추가한다. 이번에는 이 명령을 배포 DB에서 실행하지 않았다.

준비는 advisory transaction lock·2초 lock timeout·5초 statement timeout을 적용한다. migration033~036과 별도 LOGIN/선별 권한을 한 transaction에서 생성하며 실패 시 rollback한다. 기존 계정 또는 부분/전체 객체가 존재하면 암호 회전·DROP·권한 보정 없이 중단한다. 재실행 거부는 이 도구의 의도된 기존 상태 보호이며 멱등 업데이트 성공이 아니다. 합성 환자/ref는 자동 등록하지 않는다. SELECT FOR SHARE에 필요한 특정 column UPDATE는 남지만 audit UPDATE/DELETE·release metadata UPDATE·table-wide UPDATE·schema CREATE·관리 role membership은 부여하지 않는다. DB 준비 성공과 실제 파일-mount 서비스 시작·브라우저 검증을 구분한다.

`infra/azure/capstone-control-patient.compose.yml`는 명시적 opt-in overlay다. 기본 Compose는 환자 기능을 켜지 않는다. 별도 `hipass_patient_authority` LOGIN·migration033~036·최소권한 및 합성 계정/소유 ref의 명시적 등록이 준비되고 신규 증적의 독립 검토를 마친 뒤에만 활성화한다. 기존 `hipass_app`나 bootstrap 계정을 환자 연결로 재사용하지 않는다.

외부 root-protected secret 디렉터리에 `patient-authority-password`, `patient-a-service-secret`, `patient-b-service-secret`가 각각 필요하다. 모두 독립적인32~256자 값이며 readonly 파일 mount로만 전달한다. DB 비밀번호나 원문 서비스 key를 Compose YAML·Git·명령줄·보고서에 넣지 않는다. Control에는 Vault 인증서/개인키를 추가하지 않는다. Vault key는 고정 version URL의 `HIPASS_PATIENT_KEY_VAULT_KEY_ID`만 전달한다.

검증 명령: 기존 배포 환경변수 파일을 사용해 `docker compose -f infra/azure/capstone-control.compose.yml -f infra/azure/capstone-control-patient.compose.yml config --quiet`를 실행한다. 설정 검증은 DB migration·권한·실제 mount 파일·서비스 시작 검증이 아니다. 아직 자동 migration/bootstrap 서비스를 연결하지 않았다. rollback은 기존 이미지와 overlay 없는 기존 구성을 복구하며, 신규 authority/ledger를 DROP하거나 기존 DB/volume을 삭제하지 않는다. 실제 rollback은 활성화 배포와 함께 별도 검증해야 한다.

## 2026-10-09 실제 합성 CT/MRI 전달 검증 범위

`patient-vault-integration-ops.py --phantom CT|MR`는 고정된 PHANTOM Study/Series/SOP만 허용한다. 격리 SQL의 동일 환자 Grant/DPoP·receipt·release ledger에 결속하여 A 실제 private PACS mTLS QIDO12 SOP·두 WADO rendered slice → A actual Azure wrap/AES-GCM → B current release authorize/consume·actual unwrap →256×256 pixel 무결성을 검증했다. 재사용/토큰 변조/DPoP 재사용/SQL 철회 후 actual PACS read 증가 없음 및 감사 chain도 확인했다. 두 modality 모두 SQL17항목/exit0/PASS, 증적은 현재 상태 문서를 참조한다. actual PACS 데이터는 합성이며 운영 Cloud DB/기존 환자 ref는 수정하지 않았다.

이는 public TLS patient Gateway·환자 웹 로그인·UI Viewer 전체12 slice 증거가 아니다. 새 candidate image3fdee566은 source10개 일치·취약점0으로 검증했으나 아직 배포/활성화하지 않았다. 전체 MVP/v3 미완료, 신규 증적 DRAFT / UNASSIGNED.

## 2026-10-09 실제 VM-local patient Key Vault 검증과 영수증 시간 결속

준비 영수증에 서버 `issuedAt`를 HMAC 서명 결속한다. `deadline - issuedAt`는 양수·최대30000ms, deadline은 Grant exp 이내다. 각 Gateway의 현재 절대 만료 확인은 유지하며 Control은 wrap/unwrap 전후에 원래 MAC·현재 시간·권한·철회를 다시 확인한다. 수신 VM의 wall clock으로 남은 시간이30000ms를 넘는지만 보고 TTL을 판단하지 않는다. 발급시각 없는 이전 영수증은 새 코드에서 fail-closed하며 런타임 default-off와 재시작 시 process-local MAC key 교체를 유지한다. 유효기간 연장이나 만료 우회가 아니다.

`patient-vault-integration-ops.py`는 각 VM의 기존 nonroot 런타임에 공개 소스만 read-only mount하고 기존 VM-local Entra 개인키로 실제 Azure wrap/unwrap을 수행한다. Control은 격리 local SQL/loopback HTTP이며 SSH reverse tunnel로 연결한다. A와 B service key·원 요청 token은 암호화된 SSH의 transient stdin/loopback에만 전달하고 raw DEK·identity private key는 VM 밖에 반환하지 않는다. 실제 public edge TLS/운영 배포 검증은 아니다.

실제 1픽셀 합성 PNG roundtrip·SQL release CONSUMED·재사용403·DPoP 재사용/변조/철회 거부·hash chain·전용 LOGIN startup 등16항목 PASS/21.806초. A/B 원래 image/healthy 보존과 owned stage cleanup PASS; VM source127개 aggregate hash 결속. 증적 `artifacts/workstation/patient-vault-20261009T134121Z-8d5e2b463965/result.json`, DRAFT / UNASSIGNED. 실제 PACS CT/MRI·환자 브라우저·전체 MVP는 미검증/미완료다. 기존 후보 이미지56405f81은 이 issuedAt 변경 이전이므로 새 후보 빌드·스캔 전 배포할 수 없다.

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

2026-10-09 patient Azure protocol adapter: `patient-encrypted-transfer.js`는 기존 Key Vault RSA-OAEP-256 protocol client와 AES-256-GCM primitive를 사용한다. 기존 consent-required mobile manifest에 가짜 consentId를 넣지 않고 `PATIENT_IMAGE`/`PATIENT_SELF_VIEW`의 별도 단일-object manifest에 Grant·actor hash·source/Gateway·auditSession·exact patient path·SOP·deadline·원본 hash를 결속한다. manifest는 GCM AAD이며 cipher/manifest/wrapped-key hash를 patient release ledger로 검증한다. B는 원래 요청 access token의 hash를 receipt tokenHash와 비교하고 BEFORE/AFTER_UNWRAP을 별도 B 서비스 경계로 요청한다. 다른 token/path/SOP/type·변조·철회·expiry·재사용·audit failure에는 평문 반환이 없다.

A listener/B portal listener의 explicit `CAPSTONE_PATIENT_IMAGE_ENCRYPTION_REQUIRED=1` profile에 adapter를 연결했다. 기존 실제 A wrap/B unwrap Azure credential acquisition은 재사용하지만 Control policy service key와 release authority/ledger는 doctor와 별도다. 기본patient flags는0, actual VM/Cloud flags·secret files·036 migration·key ID는 변경하지 않았다. B patient secret file은 doctor secret과 같으면 거부한다. no plaintext fallback이며 abort/deadline 후 A response/input 정리·B response completion/close 시 plaintext buffer 정리를 유지한다. 이는 JS/runtime/string/library의 모든 복사본 zeroization 보장이 아니다.

로컬 RSA protocol fixture와 injected patient current-authority/ledger로 실제 RSA/AES 연산·roundtrip·변조·토큰/SOP 교체·재사용·Vault 응답 중 철회를 시험했다. 이미지 body는 명시적 합성 byte fixture, Key Vault는 local RSA transport, ledger/auth는 test double이며 실제 Azure·PACS CT/MR·SQL+crypto 전체연결·VM TLS·브라우저 픽셀 시험이 아니다. B loopback pixel branch도 injected decryptor 시험으로 따로 구분한다. 다음에는 실제 SQL ledger/HTTP와 crypto를 하나로 연결한 뒤 동일 후보 이미지·실제 Key Vault·A/B rollout·CT/MR 브라우저 흐름을 검증한다. 아래 날짜가 같은 “adapter 미연결” 문구는 이전 단계 이력이다.

2026-10-09 release HTTP 경계: `POST /gateway/patient-self-view/package/{wrap-authorize|prepare|authorize}`를 default-off runtime에 연결했다. A의 기존 별도 patient-self-view-gateway/internal-token/source/scope는 wrap/prepare만, 새 B patient-key-release-gateway/internal-token/`gateway:patient-package-key-release`는 authorize만 허용된다. 새 B secret는 patient A·doctor/data-plane/privacy/generic secret와 같으면 거부하며 Gateway ID는 인증 provider가 고정 `hospital-b-portal`로 제공한다. body의 authenticatedViewingGatewayId 같은 추가 속성은400이다. 키·기관·actor 헤더 위장을 신뢰하지 않는다. body32KiB/strict UTF8/5초 deadline/no-store, policy 거부403와 자원 오류503를 구분하고 진단·receipt·키 원문을 반환하지 않는다.

`HIPASS_CAPSTONE_PATIENT_KEY_RELEASE=1` 활성화에는 patient Grant의 기존 strict TEST/Postgres/single-writer profile 외에 별도 B credential·versioned patient Vault key ID·migration036 및 ledger SELECT/INSERT/UPDATE(status,consumed_at)가 필요하다. metadata UPDATE·DELETE는 허용하지 않는다. 실제 dedicated login startup과 public TLS ingress forwarding은 아직 미검증이다. loopback HTTP+실제 PG 시험은 기존 policy·issued patient token·감사 hash chain까지 사용했지만 실제 Azure wrap/unwrap·암호화 pixel·A/B 배포 시험은 아니다. HTTP policy input에 verified Gateway ID를 주입하는 경계만 이번에 연결됐으며 가짜 성공 crypto adapter는 runtime에 설치하지 않았다.

2026-10-09 patient release 내부 정책/ledger: `PatientBoundKeyRelease`는 patient preparation 영수증 MAC/deadline·현재 Grant/ref/source/signing key·단일 SOP pixel path를 재검증한다. doctor authority·metadata path·다른 Gateway·wrapped-key/ciphertext/manifest hash 변경은 거부한다. 별도 migration036의 `capstone_patient_key_releases`는 grant FK·unique package ID·최대30초 expiry·PENDING/PREPARED/PRECHECKED/CONSUMED 상태를 갖고 raw receipt/token/DEK/영상은 저장하지 않는다. SELECT/INSERT 및 status/consumed_at 제한 UPDATE만 필요한 bound SQL을 사용한다.

prepare는 PENDING 쓰기→기존 감사 chain 저장→현재 권한 재검증→PREPARED 활성화다. 감사 장애의 PENDING은 unwrap에 사용할 수 없다. AFTER_UNWRAP은 PRECHECKED에서만 원자적으로 한 번 소비하며 감사/권한 실패 뒤에도 상태를 되돌리지 않아 재사용으로 평문을 얻을 수 없다. 서로 다른 release는 auditSession·patient·SOP와 ledger로 연결되며 감사 저장과 ledger 상태가 하나의 DB transaction인 것은 아니다. 실패 시 orphan PENDING이나 consumed-but-not-delivered가 남을 수 있으며 이는 성공으로 표시하지 않는다. API HA·정확히 한 번 전달 보장이 아니다.

이 클래스는 내부 injection policy와 SQL repository이며 HTTP principal 경계·별도 A/B release credential·Azure patient wrap/unwrap adapter·실제 runtime에는 아직 연결되지 않았다. `authenticatedViewingGatewayId`는 향후 인증 provider의 검증 결과로만 주입해야 하며 요청 body를 신뢰하면 안 된다. 격리 PG의 정상/거부·hash 결속·동시 소비 시험은 실제 Vault 증거가 아니다. doctor key release와 별도 ledger를 유지하고 migration036을 운영/발표 DB에 아직 적용하지 않았다.

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
