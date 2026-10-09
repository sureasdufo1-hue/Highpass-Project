# Medi Q 발표 환경 통합 상태와 실행 순서

관측일: 2026-10-10 (Asia/Seoul). 신규 증적: DRAFT / UNASSIGNED.

### 최신 관측: 실제 컨테이너 등록 CLI 검증 완료 — 2026-10-10 (Asia/Seoul)

후보 `highpass-platform-mvp:capstone-patient-registration-cli-20261010`, image ID `sha256:30141f8128a26ab2b3ed987d419078382093e69310c768a4318786a71916b2df`의 격리 Compose 검증은 **11개 검사 PASS / exit0 / 297.103초 / cleanup=true**다. 증적: `artifacts/workstation/hp-patient-startup-e96e6d364eed.json` (ignored 로컬 생성물; clone에 포함되지 않음). 고정 합성 카탈로그는 기존 등록 함수를 non-superuser 앱 계정으로 실행한 시험 준비이며 HTTP 인증 증거가 아니다. 실제 operator CLI의 기본 사전검사에서 account/ref/audit 변경0, 명시적 적용에서 account1/ref2/audit1 및 hash chain 유효, 재적용 거부에서 부작용0을 확인했다. 기존 Control 준비·readiness·잘못된 입력/주체 거부·중복 secret 시작 거부 검사도 유지했다. 관련 FR-006~009/014~020/032~041.

이 후보는 기존 검증된 local base에서 `--pull=false --network=none`으로 빌드했고 base image ID 전후 일치, build exit0다. 아래 이전 후보의 소스 해시·컨테이너 취약점 결과를 이 새 image ID에 승계하지 않는다. 신규 후보의 전체 소스 attestation·Container Scan/Gate는 **NOT VERIFIED**다. 실제 cloud DB 등록·기능 활성화·공개 배포·정상/음성·rollback도 **NOT VERIFIED**이며 이번 시험으로 대체하지 않는다. 신규 증적 **DRAFT / UNASSIGNED**, 전체 MVP/v3 미완료. 다음 작업 한 개: 신규 후보의 소스 일치와 Container Scan/Gate를 고정한 뒤 최신 독립 사람 검토에 제출한다. 아래 기록은 이전 이력이다.

커밋 전 현재 소스의 Security Gate는 PASS/exit0: Node 테스트54.502초·secret scan1.161초·dependency audit1.606초, 단계별120초 제한. 직접 focused 등록/정책 거부 테스트6/6 PASS/637.8787ms/exit0 및 staged diff 검사 PASS. 전체 Node 개수는 gate가 보존하지 않아 주장하지 않는다. pnpm 실제11.7.0/lock9.0 일치, global manifest11.22.0 차이 경고 유지. 이 결과는 새 이미지 Container Gate나 배포 승인으로 승계하지 않는다.

### 최신 관측: 정상·거부 응답 결속 보강 및 후보 재검증 — 2026-10-10 (Asia/Seoul)

HEAD `6f00e2d54e28d695d4c4054184b5668580fb29ac` + dirty source. 정상 브라우저 영상과 철회 후 UI 오류/PACS read 불변만으로는503 장애를 정책 DENY로 오인할 수 있음을 확인했다. 실제 full-app의 forward 경계에서 철회 이후 rendered 응답의 status와 whitelist 오류 코드만 관측하고 **403 + PATIENT_ACCESS_DENIED**를 요구하도록 보강했다. body/token/key를 증적에 출력하지 않는다. `requirePatientPolicyDenial`은 미응답·503·500·401·다른403을 모두 거부한다. 기존 권한·암호화·TLS/mTLS·DPoP 정책과 Viewer 동작은 변경하지 않았다. 신규 테스트2 PASS, 등록/Viewer 포함 focused12/12 PASS/558.7037ms/exit0. 관련 FR-014~020/026~041.

| 최신 실행 | 결과와 시간 | 증적 |
|---|---|---|
| 환자 웹 CT, 강화된 응답 검사 | wrapper7/SQL4/Chrome8 PASS/exit0; SQL64.058초/browser46.661초; policyDenial403/PATIENT_ACCESS_DENIED | `patient-vault-20261009T162247Z-ab1a67d7929e/result.json`; browser `patient-real-browser-63b93f6f5c05/result.json`·`viewer.png` |
| 환자 웹 MR, 강화된 응답 검사 | wrapper7/SQL4/Chrome8 PASS/exit0; SQL64.432초/browser48.218초; policyDenial403/PATIENT_ACCESS_DENIED | `patient-vault-20261009T162114Z-6922c2f340a7/result.json`; browser `patient-real-browser-0c746a042b43/result.json`·`viewer.png` |
| 모바일 MR, 강화된 응답 검사 | wrapper7/SQL4/Chrome8 PASS/exit0; SQL31.817초/browser18.320초; policyDenial403/PATIENT_ACCESS_DENIED | `patient-vault-20261009T161847Z-ff2ac490d7ec/result.json`; browser `patient-real-browser-7eb6e50429dc/result.json`·`viewer.png` |
| 모바일 CT, 강화된 응답 검사 | wrapper7/SQL4/Chrome8 PASS/exit0; SQL35.671초/browser19.247초; policyDenial403/PATIENT_ACCESS_DENIED | `patient-vault-20261009T162004Z-89e1e3cb4041/result.json`; browser `patient-real-browser-33bef31a4d1d/result.json`·`viewer.png` |

위 실행은 명시적 합성 소유권 등록→실제 서명 Mock IdP 로그인·검사 선택(모바일은 개발 unlock 포함)→현재 Control API·최소권한 SQL→A 실제 합성 PACS256×256 두 SOP→A 실제 Azure wrap/AES-GCM/B unwrap→SQL Grant 철회 후 실제403와 PACS read2 유지→hash chain/release2 CONSUMED→자체 SQL/브라우저/VM stage cleanup=true와 기존 A/B 이미지/healthy 보존을 확인했다. screenshot 직접 확인. 이번 모바일 및 웹 MR에서는 Page.navigate 응답 관측 timeout 후 같은 탭 URL/로그인 DOM 확인으로 진행한 분기가 실제 실행됐다. navigation 재발행·새 프로세스 재시작·TLS 완화 없음. Page.enable timeout 진단 분기의 효과는 여전히 NOT VERIFIED다.

강화 이전의 이 turn MRI 웹 `patient-vault-20261009T161449Z-070d9bff3279`는 wrapper7/SQL4/Chrome6 PASS/exit0, SQL63.203초/browser45.459초, browser `3c65430f6548`였다. 모바일 CT `patient-vault-20261009T161639Z-da97666eb7f3`는7/4/7 PASS/exit0, SQL34.373초/browser19.185초, browser `cc2111cea957`였다. 이 이전 결과는 exact403를 보존하지 않았으므로 아래 강화된 결과로 승계하지 않는다. 모든 경로는 격리 합성 SQL/신뢰된 로컬 HTTPS/VM-local crypto이며 공개 배포·네이티브 기기/생체·환자 동의 철회 UI·전체12 SOP·수신 의료진 공유 E2E의 증거가 아니다.

모바일 시험의 relay `ConnectionResetError / WinError10054` thread 경고2개는 지속 관측되었고 최종 웹 CT도 경고1개가 있었다. HTTP/crypto/SQL 결과와 cleanup은 PASS였지만 reset 원인/시점 분류는 NOT VERIFIED로 남긴다. 경고를 숨기거나 정책 DENY로 바꾸지 않는다. 신규 증적 DRAFT / UNASSIGNED, 전체 MVP/v3 미완료.

통합 후보 `highpass-platform-mvp:capstone-patient-registration-20261010`를 기존 local base `fedbae566527…`와 `--pull=false --network=none`로 빌드/exit0 했다. Docker image ID **`sha256:2cce5a642ab287efa3396b92958e5418df73a6a11d253e7a6fd3654ca18e8a8f`**, BuildKit config digest `89714df…`와 구분한다. base ID 전후 일치 PASS. 최초 raw image ID를 FROM ARG로 전달한 빌드는 Docker가 `docker.io/library/sha256:…`로 해석해 registry insufficient_scope/exit1이었고 후보를 만들지 못했다. 검증된 기존 local tag를 사용한 재실행은 성공했다. ARG 기본값 없음 경고는 유지하며 registry/TLS 인증 검증을 완화하지 않았다. 의존성/lockfile 변경 없음.

현재 src/public/db/config/scripts **445개**(미추적 등록 helper/CLI/SQL verifier와 read-only preflight 포함)의 로컬→이미지 해시 일치/불일치0/exit0, `artifacts/workstation/patient-registration-image-source-20261010.json`. Dockerignored 임상 payload/생성물은 제외했다. nonroot/network-none/read-only/cap-drop ALL의 실제 image ID 기반 조회다. docs/test는 이미지 COPY 대상이 아니다. Trivy Scan/Gate는 같은 image ID **HIGH0/CRITICAL0/exit0/PASS**, `artifacts/security/container-scan/patient-registration-20261010.json`; 기존 예외 추가/수정 없음. Security Gate **PASS/exit0**, unit-tests58.294초/secret1.080초/dependency audit1.517초, 단계별120초, `artifacts/workstation/patient-registration-security-gate-20261010.json`. gate는 test count를 보존하지 않아 전체 개수는 주장하지 않는다. pnpm11.7.0/lock9.0, global manifest11.22.0 경고 유지.

이 image ID의 격리 Compose는 **7개 검사 PASS/exit0/197.550초/cleanup=true**, `artifacts/workstation/hp-patient-startup-b0d9f37ffb2d.json`: 실제 readonly secret mount·Control baseline ready·준비 CLI preflight/apply·재적용 거부·전용 authority LOGIN과 Control 시작·잘못된 입력400/잘못된 B 주체403·중복 서비스 secret 시작 거부·기존 격리 Control readiness를 확인했다. 생성한 project의 container/volume 잔여0을 별도 Docker 조회했다. 각 Docker 명령60초/Compose readiness45초, 외부 요청별 timeout 유지. 도중 일시적인 Dead prepare-run 상태가 조회되었으나 이후 같은 자산은 없어졌고 원래 실행은 종료0으로 완료했다. 이 관측만으로 daemon 장애나 작업 중단을 확정하지 않고 재시작하지 않았다.

이미지 해시 일치는 host 브라우저 결과를 image public E2E로 승격시키지 않는다. 등록 helper는 실제 격리 SQL에서 검증했으나 **operator 등록 CLI의 실제 container 명령 성공**은 아직 NOT VERIFIED(위 preparation CLI와 다른 명령)다. 실제 cloud DB 등록/기능 활성화/public 정상·음성·rollback도 NOT VERIFIED이다. 실제 적용은 최신 사람 검토 전 수행하지 않는다. **다음 작업 한 개: 기존 격리 Compose fixture에 고정 합성 카탈로그와 등록 CLI preflight/apply/재등록 거부·감사 검증을 연결한다.** 이는 새 정책 모듈이 아니라 동일 사용자 흐름의 배포 준비 공백을 채우는 작업이다. 이후 최신 후보의 독립 검토→공개 배포 정상/음성/rollback→원래 환자 동의·QR·수신 의료진 공유 종단 흐름이 남는다. 문법/diff/민감정보 검사 PASS, 기존 변경/DB/VM/PACS 보존, 이번 turn commit/push/deploy 없음. 아래 관측은 이전 이력이다.

### 최신 관측: 명시적 합성 환자 소유권 등록 준비 — 2026-10-10 (Asia/Seoul)

기준 HEAD `6f00e2d54e28d695d4c4054184b5668580fb29ac` + 신규 dirty 변경. 기존 전체 앱 verifier의 직접 account/ref INSERT를 고정 카탈로그 기반 `registerPatientPhantom`의 기본 preflight→명시적 적용→재적용 거부로 교체했다. operator CLI는 서버 startup/HTTP에 연결하지 않는다. 기존 writer 정지·유지보수·재로드 전제가 있으며 외부 병원 소유권 검증/법률 판정을 대신하지 않는다. 기존 최소권한·동의·DPoP·mTLS·Vault 정책 변경 없음. 관련 FR-006~009/014~020/032~041.

`node scripts/verify-patient-phantom-registration.js`의 최신 실제 격리 SQL 결과는 **6개 검사 PASS/exit0/13.561초/cleanup=true**, `artifacts/workstation/hp-patient-registration-a0be8cb69d3c/result.json`. 다른 app 연결이 살아 있으면 거부, 기본 preflight 변경0, Series 카탈로그 불일치 거부/계정·ref·감사 부작용0, 감사 INSERT 장애 시 account/ref rollback, 명시적 account1/ref2/audit1 commit와 재등록 거부, 기존 persisted hash chain 유효성을 확인했다. SQL schema bootstrap은 생성한 tmpfs DB에서만 수행했다. 원래 VM/cloud DB·PACS·volume 보존. 단위4/4 PASS/334.977ms/exit0, 문법/diff 검사 PASS.

최종 parent Study 결속 보완 이후의 실제 SQL은 **7개 PASS/exit0/13.931초/cleanup=true**, `artifacts/workstation/hp-patient-registration-84d7cc611488/result.json`. 격리 DB의 CT Series를 MR Study에 잘못 결속한 음성 fixture도 거부하며 계정/ref/audit count 불변을 확인했다. 중간 `3e6915b1aa3a`는 parent 비교 포함/음성 fixture 추가 전6 PASS/20.831초였다. 최종 focused 등록/Viewer **10/10 PASS/375.4697ms/exit0**, Node/Python 문법·secret findings0·diff PASS. 아래 Security Gate는 parent 비교/추가 CDP 진단 이전 실행으로, 최종 전체 gate 재실행은 NOT VERIFIED이며 이 focused/SQL 결과로 대체하지 않는다.

최초 `hp-patient-registration-498772faee61`은 업무5개 검사 후 cleanup 확인 FAIL/20.481초/exit1이었다. 이후 실제 Docker 조회에서는 해당 자산이 없어 삭제 완료를 확인했지만 최초 결과는 수정하지 않았다. `docker stop` 후 동일 owned 자산의 auto-remove 완료를10초 안에 관측하도록 보완했다. 중간 `3719d4e26ce5`는5개 PASS/15.311초/exit0/cleanup=true, 최신 실행은 app-writer 음성도 포함한다. 정리 이력은 제품 보안 거부로 분류하지 않는다.

클라우드는 read-only 재조회했다: `artifacts/workstation/patient-deployment-preflight-20261009T160452Z/result.json`, **NOT VERIFIED**. Control/ingress a548790… 및 PostgreSQL8d0e686… baseline PASS, readOnly=on/5초 제한. 기존 schema와 합성 환자·ACTIVE HOSP-A·고정 CT/MR Study-Series2개 최소 메타데이터 존재 PASS. 이는 helper의 전체 필드 비교나 PACS 실물 검사/실제 migration preflight 실행이 아니다. 환자 flags=false, authority tables/role 없음, protected secret file3개 미확인 상태는 그대로다. Python 도구의 정의된 종료 코드는2이며 이번 PowerShell wrapper의 관측 종료 코드는1이었다. 실제 등록/활성화는 수행하지 않았다.

Security Gate는 **PASS/exit0**, unit-tests58.709초/secret-scan1.486초/dependency-audit1.829초, 단계별120초 상한. stdout는 이번 터미널 출력이며 gate 자체는 테스트 count를 반환하지 않는다. pnpm11.7.0/lock9.0 일치, global manifest11.22.0 경고 보존; 서명/TLS 우회 없음. 새 unit 조건 보완은 직접4개 검사로 별도 확인했다.

새 등록 경로를 사용하는 첫 실제 웹 CT 시험 `patient-vault-20261009T160523Z-9482a04802dc`는 **FAIL/exit1**: 등록·전용 SQL·Control readiness 성공 이후 로그인 전 `PATIENT_BROWSER_CDP_TIMEOUT_PAGE_ENABLE`, browser `patient-real-browser-9459bd122483`/15.579초, SQL harness33.788초. 두 번째 `patient-vault-20261009T160710Z-b503314c9ac7`도 같은 관측 timeout/FAIL/exit1, browser `aa237b2e5da6`/12.579초·SQL28.461초다. PACS/Vault 업무 호출은 없었다. SQL/브라우저/VM stage cleanup=true, 기존 A/B 보존 PASS. 권한 DENY나 암호화 실패로 해석하지 않는다. 독립 fresh Chrome154.0.8037.98 진단에서는 root CDP/REST 새 탭 양쪽의 Page.enable과 Runtime.evaluate가 응답해 원인을 확정하지 못했다. 검증기에는 Page.enable timeout 시 동일 탭 Page.getFrameTree만 확인한 뒤 원래 FAIL을 유지하는 진단을 추가했다. Chrome/TLS 정책이나 timeout을 늘려 PASS로 바꾸지 않았다.

최종 CT `patient-vault-20261009T161039Z-39b144448742`는 **wrapper7/SQL4/Chrome6 PASS/exit0**, SQL64.713초/browser46.210초, browser `patient-real-browser-c503357a0828/result.json`·`viewer.png` 직접 확인. 명시적 등록 preflight/apply/reapply-deny→실제 PHANTOM 웹 로그인/검사 선택→Grant/DPoP→A mTLS PACS→실제 Azure wrap/AES-GCM/B unwrap→두256×256 SOP decode→격리 SQL Grant 철회 후 거부/read2 불변→화면 제거/focus/storage0→persisted hash chain/release2 CONSUMED→생성 SQL/브라우저/VM stage cleanup과 기존 A/B 보존까지 확인했다. 일반 동의 철회 UI·공개 배포·native mobile·전체12 SOP 검증은 아니다. 최종 실행은 Page.enable timeout 없이 통과했으므로 신규 진단 분기의 응답/원인은 NOT VERIFIED이다. 이후 추가한 Series의 parent Study 비교는 별도 단위·실제 SQL로 검증하며, 이 브라우저 기록에 소급 포함하지 않는다. 최신 소스 MR/모바일 재검증은 남아 있다.

이전 후보 이미지 `a287821…`는 신규 등록 helper/CLI를 포함하지 않으므로 최신 배포 후보로 승계하지 않는다. 신규 증적 **DRAFT / UNASSIGNED**, ignored artifacts는 clone에 포함되지 않는다. **다음 작업 한 개: 새 등록 절차를 사용하는 웹·모바일의 실제 PACS/Vault 흐름을 끝내고 동일 소스의 후보 이미지·gate를 다시 고정한다.** 그 이후 최신 사람 검토/실제 cloud 적용·공개 정상/거부·rollback이 남으며 전체 공유 흐름/MVP/v3 미완료다.

### 최신 관측: 웹·모바일 통합 후보 검사 PASS / 실제 배포 준비 미완료 — 2026-10-10 (Asia/Seoul)

HEAD `55d49a454ee956849ce70abefbbff33af9f03cfd` + 현재 dirty source. `Dockerfile.patient-capstone`로 기존 `fedbae566527…` base에서 `--pull=false --network=none` 빌드/exit0. 의존성·lockfile 변경 없이 기존 runtime을 사용했고 base ID 전후 일치를 확인했다. 후보 `highpass-platform-mvp:capstone-patient-web-mobile-20261010`, 정확한 Docker image ID **`sha256:a287821b32b8a834429c7c2c645059394fe5ecdeed341bf2f77a8ae9d1c4ef56`**. BuildKit config digest `6b7f29…`와 image ID를 혼동하지 않는다. base ARG 기본값 없음 경고는 남지만 빌드는 명시적 base로 성공했다. 별도 소스/hash attestation을 이미지의 nonroot Node·network-none/read-only/cap-drop ALL로 실행해 tracked src/public/db/config/scripts **441개 일치/불일치0/exit0**, `artifacts/workstation/patient-web-mobile-image-source-20261010.json`. clinical payload 제외. 이후 추가한 host-only `patient-deployment-preflight.py`와 docs는 이 이미지에 포함되었다고 주장하지 않는다.

| 검사 | 최신 결과 | 증적 |
|---|---|---|
| Container Scan/Gate | HIGH0/CRITICAL0, scan 및 gate exit0/PASS; 정확한 image ID 일치 | `artifacts/security/container-scan/patient-web-mobile-20261010.json` |
| 실제 격리 Compose 시작 | 7 PASS/165.542초/exit0, cleanup=true | `artifacts/workstation/hp-patient-startup-46bf8dd856e6.json` |
| Security Gate | unit-tests/secret-scan/dependency-audit 모두 PASS/exit0; 단계별120초 상한 | `artifacts/workstation/patient-web-mobile-security-gate-20261010.json` |
| 선택 설정·준비 회귀 | 9/9 PASS/185.7244ms/exit0 | 이번 터미널 출력 |
| A/B 현재 런타임·Entra 신원 | 4 PASS/exit0; A2c7b366…/B940806… healthy 보존, 별도 A/B 인증 HTTP200 | `artifacts/workstation/patient-key-inventory-20261009T155013Z/result.json` |
| 클라우드 환자 배포 준비 | NOT VERIFIED/exit2, 기능 미활성·준비 객체/파일 부재 | `artifacts/workstation/patient-deployment-preflight-20261009T155238Z/result.json` |

Compose는 실제 readonly secret mount·DB preparation preflight/apply·재적용 거부·전용 LOGIN/Control entrypoint ready·잘못된 본문과 B 주체의 A wrap 거부·중복 secret 시작 거부·기존 격리 Control health를 확인했다. 자체 project/volume만 회수했고 남은 자체 container가 없음을 확인했다. 최초 `hp-patient-startup-f8e7fe571e48`은 postgres-and-bootstrap 단계 FAIL/134.946초/exit1, cleanup=true였고 원인은 NOT VERIFIED이다. Docker 검사 동시 실행을 멈춘 뒤 동일 시험의 순차 실행이 통과했지만 이것만으로 리소스 경합이나 daemon 결함을 확정하지 않는다. 과거 FAIL은 소급 변경하지 않는다.

Security Gate의 Node 단계 exit0/58.649초, secret 단계 exit0/1.068초, audit 단계 exit0/1.615초다. gate는 테스트 stdout/count를 보존하지 않으므로849개를 이번 gate의 직접 관측 수라고 주장하지 않는다(직전 전체 Node849/849는 아래 기록). 실제 실행 pnpm11.7.0/lockfile9.0 일치 PASS, global manifest11.22.0 차이 경고 유지; signature/TLS 검증 우회나 lockfile 재생성 없음. 새 Python 문법·secret findings0·diff PASS.

새 read-only `scripts/patient-deployment-preflight.py`는 고정 cloud host key와 기존 Control/ingress a548790…/PostgreSQL8d0e686…·healthy·Compose context를 확인했다. VM 안에서 whitelist flag boolean만 반환하고 전체 env/secret 값은 출력하지 않는다. root-owned regular-file lstat만 확인하며 값은 읽지 않는다. SQL은 `BEGIN READ ONLY`/5초 statement 제한으로 역할/관계 존재 metadata만 조회했다. **patient grants/release/single-writer flags=false, authority table4개·전용 role 없음, patient secret3개가 보호된 regular file로 확인되지 않음**이다. 기존 배포를 변경하지 않았다. 소유 ref 내용·실제 mount·권한 세부·public E2E readiness는 NOT VERIFIED. 스크립트 자체는 모든 metadata가 있어도 전체 배포 준비 PASS를 내리지 않는다.

Azure Validate 스킬은 승인된 `.azure/deployment-plan.md`를 선행 요구하지만 이 프로젝트는 기존 VM/Compose 방식이며 해당 파일/azure.yaml 기반 azd 체계가 없다. azure-prepare의 azd 전용 적용 범위와 맞지 않아 새 IaC/승인 체계를 도입하지 않고 기존 도구로 위 검사만 수행했다. **스킬 workflow의 Validated 상태는 선언하지 않는다.** Azure 비용·리소스·역할·구독 설정 변경 없음.

신규 증적 **DRAFT / UNASSIGNED**. 이번 image/Compose 검사는 앞선 host 브라우저 CT/MR 결과와 서로 다른 실행 환경이며 image 내부 public browser 종단 검증으로 합산하지 않는다. 전체 MVP/v3 미완료, 독립 검토 승인 승계 없음. 관련 FR-006~013/014~041. 이번 작업은 미커밋/미배포이며 기존 코드·DB·PACS·volume 보존.

**다음 작업 한 개: 실제 cloud 환자 준비의 rollback-only preflight와 명시적 합성 계정/소유 ref 등록을 동일 흐름의 배포 준비 작업으로 연결한다.** 준비가 끝나도 최신 증적 사람 검토 전 활성화하지 않으며, 실제 공개 환경 정상/음성·rollback 및 전체 환자 동의→수신 의료진 공유 흐름은 남아 있다. SSH relay 종료 reset 경고의 원인 분류도 미완료다.

### 최신 관측: 모바일 전체 PWA CT·MR 본인 열람·Grant 거부 검증 — 2026-10-10 (Asia/Seoul)

HEAD `55d49a454ee956849ce70abefbbff33af9f03cfd` + 현재 미커밋 변경. `--phantom CT|MR --browser --full-app --mobile` 모드를 기존 격리 verifier에 추가했다. 실제 `/mobile/`·375px Chrome viewport → PHANTOM 서명 Mock IdP 로그인 → 서버 확인 PIN 화면 체험(실제 PIN/생체/TEE 아님) → 서버 검사 목록·영상 탭·정확한 Study 선택 → 공통 Viewer의 Grant/DPoP·A mTLS QIDO → A 실제 Azure wrap/AES-GCM/B unwrap → 실제256×256 두 SOP decode → 격리 SQL Grant 철회 후 거부·PACS read2 유지 → 영상 제거/focus 복귀·localStorage/sessionStorage0을 검증했다. 실제 full Control API 및 최소권한 SQL을 사용했으며 raw DEK·개인키를 브라우저나 증적에 반환하지 않았다. 브라우저 스킬의 fresh DOM/실제 pointer 입력 원칙을 유지했다.

| 실행 | 결과 | 증적 |
|---|---|---|
| 모바일 CT | wrapper7/SQL harness4/Chrome6 PASS, exit0; SQL29.360초/browser14.400초 | `artifacts/workstation/patient-vault-20261009T153745Z-2b032e691355/result.json`; browser `patient-real-browser-49321341b6a4/result.json`·`viewer.png` |
| 모바일 MR | wrapper7/SQL harness4/Chrome6 PASS, exit0; SQL35.448초/browser19.588초 | `artifacts/workstation/patient-vault-20261009T154024Z-404ac13c0221/result.json`; browser `patient-real-browser-676f91e0e790/result.json`·`viewer.png` |

각 실행은 DB 재로드 후 기존 감사 hash chain·철회된 Grant의 release2 CONSUMED·PACS read2 유지 PASS, SQL/Chrome/VM stage cleanup=true, 기존 A/B healthy·이미지 유지. CT/MR screenshot을 직접 확인했다. 두 영상은 목록의 서로 다른 SOP이지 해부학적 인접·전체12개 pixel 검증이 아니다. Grant 철회는 시험용 SQL 조작이며 환자 화면의 동의 철회/만료 완료로 주장하지 않는다. native Android/iOS·실제 PIN/생체·Secure Vault offline·카메라 QR·public 배포 ingress·전체 MVP/v3는 미검증/미완료다.

실패는 보존한다: 모바일 CT `…T153622Z-5f7112f674f3`/browser`ee617f1c66a6` 및 MR `…T153855Z-b19594724930`/browser`1ffa966a7097`은 로그인 전 CDP timeout/전체 FAIL, cleanup=true. MR에서는 `PAGE_NAVIGATE` 관측 timeout을 식별했다. 명령 응답 timeout 이후 같은 tab의 정확한 URL와 실제 로그인 DOM를20초 안에 재확인하고 navigation 재발행·TLS 완화 없이 계속 관측하도록 보완했다. 최종 MR은 timeout 없이 정상 종료됐으므로 이 recovery 분기의 실제 성공은 NOT VERIFIED다. MR 종료 중 relay thread WinError10054 연결 reset 경고2개가 관측됐다. 업무 HTTP/crypto 결과와 자산 정리는 PASS였지만 경고의 정확한 원인/시점 분류는 NOT VERIFIED로 남기며 숨기지 않는다.

전체 Node **849/849 PASS/59.2903219초/exit0**, `artifacts/workstation/patient-mobile-full-app-node-regression-20261010.log`는 mobile mode 추가 기준이며 이후 CDP 진단·동일 tab 관측 변경은 문법 및 최종 MR 실제 실행 범위로 확인했다. focused6/6 PASS/224.5932ms/exit0, Node/Python 문법·secret findings0·diff PASS. 잘못된 `--mobile` 단독 요청은 CLI exit2로 시작 전 거부했다. 관련 FR-006~013/014~041. 신규 증적 **DRAFT / UNASSIGNED**, ignored artifact는 Git clone에 포함되지 않는다. 배포·커밋·푸시는 이번 작업에서 수행하지 않았다.

**다음 작업 한 개: 이 웹·모바일 소스를 포함하는 통합 후보 이미지의 source hash·보안 검사와 기존 공개 배포의 읽기 전용 준비 점검을 수행한다.** relay 경고 분류, 배포 DB 계정/소유 ref 준비, 최신 독립 검토가 남아 있으므로 아직 기능 활성화부터 하지 않는다. 실제 public 환경의 정상·음성·rollback 검증 및 원래 공유/동의 핵심 흐름 전체 완료도 남아 있다. 아래 관측은 이전 이력이다.

### 최신 관측: 환자 웹 CT·MR 종단 정상·Grant 철회 거부 — 2026-10-10 (Asia/Seoul)

기준 HEAD `55d49a454ee956849ce70abefbbff33af9f03cfd` + Viewer focus 복귀·검증기 종료 판정 변경. UI/UX Pro Max 스킬의 기본 keyboard/focus 지침을 적용했다(검색은 core 모듈 누락으로2회 실패). 주기적인 검사 목록 DOM 교체 이후에도 동일 container·동일 Study의 표시되고 활성화된 launcher만 찾아 focus를 복귀한다. 다른 Study/숨김/disabled/inert 버튼을 선택하지 않는다. 환자 권한·암호화·TLS 정책은 변경하지 않았다.

`python scripts/patient-vault-integration-ops.py --phantom CT --browser --full-app` 최종 **wrapper7 PASS / full Control SQL harness4 PASS / Chrome6 PASS / exit0**, `artifacts/workstation/patient-vault-20261009T152938Z-daf4f4702c39/result.json`. SQL harness55.245초, browser39.372초(`patient-real-browser-467027e8b54f/result.json`·`viewer.png`). 실제 환자 웹의 Mock IdP PHANTOM 로그인 → 서버 검사 목록 → CT 선택 → 본인 Grant/DPoP → A 합성 PACS mTLS → 실제 Azure wrap/AES-GCM/B unwrap → 서로 다른256×256 SOP2개 decode·다음 영상 → 격리 SQL Grant REVOKED 후 신규 fetch 거부·A PACS read2 유지 → 닫기/영상 제거/focus 복귀·browser storage0을 확인했다. 재로드한 SQL의 기존 audit hash chain·해당 Grant release2개 CONSUMED 검증도 PASS. 원본 합성 PACS는 A, 시험 SQL은 독립 tmpfs, 클라우드 원본 지속 저장 없음. A/B 기존 이미지와 healthy 상태 보존, 생성 SQL·브라우저·VM stage cleanup=true. CT 캡처를 직접 확인했다.

실패 이력은 유지한다. `…T152626Z-7b6b1dbd4d86`은 Chrome6 PASS 후 자식 process의 signal 종료를 exitCode만으로 관측해 final-audit timeout/전체 FAIL이었다. exitCode 또는 signalCode의 terminal 상태를 확인하도록 수정했다. `…T152823Z-e858460a7e9a`는 로그인 전 CDP timeout/전체 FAIL로, TLS/권한 DENY로 분류하지 않는다. 두 실행 모두 정확한 생성 자산 cleanup=true이며 최종 PASS로 소급 변경하지 않는다. 신규 focused test 최초5/6 FAIL은 fake DOM fixture options가 덮어써진 시험 오류였으며 수정 후6/6 PASS/182.6858ms/exit0.

전체 Node **849/849 PASS / 60.4504575초 / exit0**, `artifacts/workstation/patient-focus-node-regression-20261010.log`는 focus 변경 기준 실행이다. 이후 검증기 signal 종료 판정은 문법 및 최종 CT 실제 실행으로 확인했다. Secret patterns findings0/diff PASS. 관련 FR-006~013/014~041. 신규 증적 **DRAFT / UNASSIGNED**, ignored artifact는 clone에 포함되지 않는다. 공개 배포 public ingress·모바일 전체 앱·환자 화면의 동의 철회/만료·전체12 SOP pixel·전체 MVP/v3 완료 증거가 아니다. Grant 상태 변경은 격리 SQL 시험 조작이며 UI 동의 철회 완료로 주장하지 않는다.

MR도 동일 전체 웹 경로를 실행했다. 최초 `…T153112Z-304bf90317e4` / browser `0fe07ea75a12`은 로그인·검사 목록 이후 timeout/전체 FAIL: 캡처에서 MR launcher가 viewport 밖에 있었고 VM metadata/pixel 호출은 발생하지 않았다. 자동화 도구가 대상 버튼을 instant scrollIntoView 후 새 DOM/좌표를 읽어 실제 마우스 클릭하도록 수정했다. 정책 거부나 제품 Viewer 실패로 단정하지 않는다. 최종 MR `artifacts/workstation/patient-vault-20261009T153258Z-2adc9a030eca/result.json` **wrapper7 PASS / SQL harness4 PASS / Chrome6 PASS / exit0**, SQL65.662초/browser47.491초(`patient-real-browser-43ff1d0a4a46/result.json`·`viewer.png`). 서로 다른 두256×256 MR SOP 표시, SQL Grant 철회 후 read2 유지, focus 복귀/storage0, SQL hash chain/release2 CONSUMED, 모든 생성 자산 cleanup=true·원래 A/B 보존을 확인했다. MR 캡처도 직접 확인했다. 두 목록 항목은 해부학적 인접 슬라이스라는 의미가 아니다.

wrapper의 scope 설명도 `--full-app`/공통 launcher 시험을 구분하도록 보완했다. 최종 MR은 새 설명 기준이며 앞선 CT 원문 wrapper의 보수적인 'not full app' 설명은 당시 기록으로 보존하고 nested browser/SQL scope에서 실제 시험 범위를 확인한다. 검증기 수정의 Node/Python 문법·focused6/6 PASS/220.7326ms/exit0·secret findings0/diff PASS; 전체 Node849 결과 이후 검증기 변경은 최종 실제 CT/MR 및 문법 검증 범위이다. 이번 소스 변경은 미커밋/미배포이다.

**다음 작업 한 개: 모바일 전체 앱의 로그인·검사 선택·Viewer 정상/거부를 동일 격리 실제 PACS/Vault 흐름에 연결한다.** 공개 배포 활성화/rollback과 최종 독립 검토는 그 뒤에 남는다. 아래 FAIL 및 과거 다음 작업은 각각 당시 이력이다.

### 최신 체크포인트: 실제 환자 웹 종단 검증은 FAIL — 2026-10-10 (Asia/Seoul)

커밋·푸시 요청에 따라 현재 검증 도구를 저장한다. 기준은 `c13c903c94a33a2822d4ac90b419ab93acfa048b` 이후 변경이며 공개 배포는 변경하지 않았다. `--phantom CT --browser --full-app`은 별도 tmpfs PostgreSQL·최소권한 LOGIN·실제 Control entrypoint·Mock IdP 환자 로그인·검사 선택·기존 환자 웹·공통 Viewer를 사용했다. 로컬 신뢰 HTTPS 및 VM-local 합성 PACS/Azure 경로이며 실제 배포 public ingress나 모바일 전체 앱 시험은 아니다.

실행 `artifacts/workstation/patient-vault-20261009T151840Z-5a0659305a01/result.json`은 **전체 FAIL / exit1**이다. 브라우저 `patient-real-browser-4a0cb65f4f60/result.json`에서 TLS 검증, 실제 환자 웹 로그인·서버 검사 목록, 서로 다른 두256×256 SOP decode, 격리 SQL Grant 철회 후 거부·PACS 추가 읽기 없음까지 확인했으나 닫기 후 launcher focus 복귀 assertion에서 실패했다. 주기적인 목록 DOM 교체와 관련된 것으로 추정하며 수정 효과는 아직 미검증이다. 마지막 SQL 감사 검증 단계는 미실행이다. 브라우저50.048초/SQL harness72.857초, 각각 cleanup=true; VM 원래 서비스와 source staging 정리 확인. 이전 syntax 실패 실행 `…T151714Z-a9f45185b15d`도 삭제하거나 PASS로 바꾸지 않는다.

해당 코드 기준 전체 Node **848/848 PASS / 55.8662834초 / exit0**, `artifacts/workstation/patient-full-app-node-regression-20261010.log`는 기존 실행 결과이며 이번 커밋 작업에서 다시 실행한 결과가 아니다. 실행 artifact는 ignored 로컬 자료로 커밋하지 않는다. 신규 증적은 **DRAFT / UNASSIGNED**이며 전체 MVP/v3 미완료. 관련 FR-006~013/014~041.

**다음 작업 한 개: 실제 환자 웹에서 Viewer 닫기 후 focus 복귀 실패를 최소 수정하고 동일 CT 종단 시험을 재실행한다.** MR 전체 웹·모바일·공개 배포 활성화/rollback·최종 사람 검토는 남아 있다. 아래의 공통 Viewer PASS는 자체 launcher 범위의 이전 성공이며 이번 전체 앱 FAIL을 대체하지 않는다.

### 최신 관측: 실제 PACS·Vault·SQL·Chrome 공통 Viewer 연결 — 2026-10-10 (Asia/Seoul)

기준 HEAD `c13c903c94a33a2822d4ac90b419ab93acfa048b` + 이번 미커밋 검증 도구 변경. 기존 공개 배포 이미지는 유지했다. A `2c7b366483f1…`, B `940806f602ec…` healthy 및 원래 이미지 보존을 각 실행 후 확인했다. 원본 영상은 A 합성 PACS, 시험 권한·Grant·release·감사는 별도 tmpfs SQL, Azure wrap/unwrap은 기존 VM-local A/B 신원이다. PostgreSQL 스킬의 최소권한·bound query·기존 감사 chain을 유지했다.

`patient-vault-integration-ops.py --phantom CT|MR --browser`로 현재 공통 `patient-pixel-viewer.js`를 실제 Chrome에 로드했다. 개발 CA/hostname 검증을 유지한 로컬 HTTPS → signed PATIENT 시험 인증·신뢰 ingress 서명 → SQL 본인 Grant/DPoP → A 실제 mTLS QIDO12 SOP → 선택 WADO pixel → actual Azure wrap/AES-GCM → B actual unwrap/release consume → 브라우저 256×256 decode·다음 영상까지 연결했다. UI 시험 화면의 launcher는 격리 adapter이며 **환자 포털/모바일 전체 앱의 로그인·메뉴 상호작용을 대체하지 않는다**. 임의 픽셀 응답으로 정상 표시하지 않는다. 선택한 두 목록 항목은 서로 다른 실제 SOP이며, 정렬·해부학적으로 인접한 슬라이스 또는12개 전체 pixel 검증으로 주장하지 않는다.

| 실행 | 최신 결과 | 증적 |
|---|---|---|
| CT | wrapper7 PASS / SQL19 PASS, 32.115초 / Chrome5 PASS, 15.547초 / exit0 | `artifacts/workstation/patient-vault-20261009T150724Z-6ee23a7fc25d/result.json`, browser `patient-real-browser-00ed0068a506/result.json`·`viewer.png` |
| MR | wrapper7 PASS / SQL19 PASS, 40.377초 / Chrome5 PASS, 17.174초 / exit0 | `artifacts/workstation/patient-vault-20261009T150852Z-bc5ce3db3f0a/result.json`, browser `patient-real-browser-80703b9fad84/result.json`·`viewer.png` |

각 실행 grants5/audits75/proofs10, 브라우저 Grant의 release2개 CONSUMED·그 Grant REVOKED 확인, SQL hash chain PASS. 브라우저 재조회403 후 실제 A PACS rendered read는4 유지(앞선 API2 + 브라우저2), 닫기 후 이미지 제거·focus 복귀·storage0 확인. Grant 철회는 **격리 시험 DB에서의 명시적 상태 변경**이며 환자 화면의 동의 철회 버튼/업무 API 검증으로 승계하지 않는다. SQL·Chrome·remote stage cleanup=true, 기존 VM 서비스/DB/volume 변경 없음. raw DEK·identity 개인키는 VM 밖에 반환하지 않았으며 원문 토큰은 증적에 기록하지 않았다.

실패 이력도 유지한다. 최초 로컬 RSA/CT 시도의 Docker 동기 호출15초 timeout은 이후 생성 자산 확인과 구분했다. 시작/정리를 비동기·30초 제한으로 바꾸고, 정확한 자체 이름·라벨·AutoRemove·비영구 mount 확인 후 회수 및 제거 완료 polling을 추가했다. 원인을 Docker Engine 결함으로 확정하지 않는다. `…T150449Z-72d71fe3d4da` 실행은 첫 브라우저 pixel 후 다음 SOP가 시험용1·2 whitelist 밖이어서 전체 FAIL; worker를 고정 합성 Series의12 SOP 범위로 정렬했다. 서버 권한/Study/Series/receipt 검증을 완화하지 않았다. 해당 실행의 cleanup=false는 당시 기록이며 이후 컨테이너 부재 확인으로 소급 PASS 처리하지 않는다. 잔여로 확인된 시험용 컨테이너3개(실행 중2·Created1)는 이름/라벨/생성시각을 확인해 삭제했고 tmpfs 이외 기존 데이터는 삭제하지 않았다.

최종 전체 Node **848/848 PASS / 43.9685922초 / exit0**, `artifacts/workstation/patient-browser-pacs-node-regression-final-20261010.log`. 앞선 중간 회귀도848 PASS/50.3917379초이나 최종 결과와 구분한다. Node/Python 문법·secret 패턴 findings0·diff PASS. 관련 FR-006~013/014~031/032~041. 증적은 ignored 로컬 자료라 clone에 포함되지 않는다. 신규 증적 **DRAFT / UNASSIGNED**, 전체 MVP/v3 미완료.

**다음 작업 한 개: 검증된 공통 Viewer를 실제 환자 포털·모바일 전체 앱의 로그인/검사 선택과 연결한 동일 격리 환경을 검증하고, 그 결과를 바탕으로 발표 배포 활성화·rollback을 준비한다.** 실 배포용 소유 ref/계정 등록, public ingress/A/B 활성화, patient UI 동의 철회·만료, 최종 독립 검토는 아직 미완료다. 아래 관측은 과거 이력이다.

### 커밋·푸시 체크포인트 — 2026-10-09

사용자의 커밋·푸시 지시에 따라 환자 Viewer·DB 준비 도구·Compose overlay·검증 스크립트·테스트·문서를 기록한다. 이번 선택 회귀26/26 PASS, exit0, 765.2852ms 및 secret 패턴 검사 findings0, diff 검사 PASS. 전체848/848은 아래의 이전 실행 결과이며 이번에 재실행한 결과가 아니다. VM 설정·배경 이미지·secret·인증서·영상 payload·실행 artifact는 제외한다. 커밋·푸시는 배포나 전체 MVP 완료를 의미하지 않는다.

보존된 실제 Chrome 검증 결과 `artifacts/workstation/patient-pixel-browser-1704528fdb99/result.json`: 11항목 PASS, 9.964초, cleanup=true, browserStopConfirmed=true. 신뢰된 로컬 HTTPS에서 2×2 PNG 두 영상의 실제 decode/다음 영상·닫기/Escape·거부/범위 불일치/손상/만료·늦은 응답 차단·브라우저 storage 미사용을 확인했다. 종료된 자체 Chrome의 exit1은 강제 종료 확인 결과이며 스크립트 PASS와 구분한다. ERR_ABORTED2건은 중단된 요청 기록이지 정책 DENY 증거가 아니다. 기존 실패 기록은 보존한다. 최초 실패의 임시 프로필 잔여 디렉터리와 fixture HTML의 UTF-8 표시 보완은 남아 있다.

이 브라우저 시험은 합성 protocol fixture이며 실제 PACS·Azure·SQL authority·환자 웹/모바일 전체 앱·현재 배포의 종단 성공이 아니다. 신규 증적 DRAFT / UNASSIGNED, 전체 MVP/v3 미완료. **다음 작업 한 개: 동일 공통 Viewer를 실제 PACS/Vault와 격리 SQL 사용자 흐름에 연결해 브라우저 정상·거부를 검증한다.** 아래의 미커밋/다음 작업 표현은 각 관측 당시 이력이다.

### 환자 웹·모바일 실제 pixel 경로 연결 구현 — 2026-10-09

`public/patient-pixel-viewer.js`에 공통 환자 전용 Viewer를 구현하고 웹 `openPatientStudyViewer`·모바일 `openCineViewer`에서 연결했다. 현재 검사 목록의 첫 Series 하나만 선택해 signed PATIENT 인증·메모리 P-256 DPoP로 `self-view-grants` 발급 → 정확한 Study/Series/SOP 목록 검증 → 선택 SOP의 `/patient-dicomweb/.../rendered`를 lazy fetch한다. B의 기존 환자 전용 Azure decrypt 경로를 사용하도록 요청하며 브라우저는 provider key/DEK를 받지 않는다. 서버 Grant lifetime≤300초와 절대 만료 확인, 새 proof jti/ath, no-store/no-referrer·유한 요청/decode timeout, 닫기/실패/만료 시 object URL 해제·영상 제거, 다운로드 버튼 없음. 실제 PNG/JPEG decode 전에는 성공 표시하지 않는다. 요청 거부 시 예시 canvas/의료진 token으로 대체하지 않는다. 기존 illustrative controller는 역사적 코드로만 보존했고 새 열람 entrypoint에서는 호출하지 않는다.

PWA shell-v5는 공통 JS만 public allowlist에 추가했고 API·환자 DICOMweb·Authorization 요청의 Cache Storage 우회는 유지했다. UI/UX Pro Max 스킬의 로딩·상태 문구·native dialog/Escape·focus 복귀·버튼 비활성 지침을 적용했다. 스킬 검색은 `core` 누락으로2회 실패했으므로 검색 결과를 적용했다고 주장하지 않는다. 기존 디자인을 전면 재설계하지 않았다.

신규 모델5/5 PASS/197.7273ms, 선택21/21 PASS/973.2457ms/exit0. 테스트는 mock HTTP/3바이트 blob·Node WebCrypto·entrypoint delegation 기준이며 실제 PNG decode/브라우저/DB/Key Vault의 정상 pixel 표시 증거는 아니다. 최초 전체 Node **845/847, 2 FAIL, 42.0676195초/exit1** (`patient-pixel-ui-node-regression-20261009.log`)을 보존했다: 이전 VM 테스트에 새 `capstoneAuth` 의존성이 없고, 모바일 테스트가 단일 예시 프레임 상태를 기대했다. 새 인증 거부→Viewer 미시작 및 signed context delegation을 검증하도록 갱신했다. 최종 전체 Node **848/848 PASS/42.4650079초/exit0** (`patient-pixel-ui-node-regression-final-20261009.log`), secret findings0·문법/diff PASS.

이번 변경은 미배포/미커밋이며 기존 `fedbae566…` 이미지에는 새 UI가 없다. 실제 합성 환자 authority/ref 등록·patient ingress/A/B 활성화·실제 CT/MRI pixel/다음 slice 브라우저 검증·만료/철회 UI·최종 독립 검토는 아직 남아 있다. 신규 증적 DRAFT / UNASSIGNED, 전체 MVP/v3 미완료. 관련 FR-006~013/021~025/026~036/037~041.

**다음 작업 한 개: 실제 브라우저에서 이 공통 Viewer의 정상·거부·만료·닫기/late response를 격리 HTTPS 환경으로 검증하고, 동일 코드를 실제 PACS/Vault 흐름에 연결.** 모델 PASS를 브라우저 종단 PASS로 승계하지 않는다.

### 실제 secret mount·Control entrypoint 격리 종단 시작 — 2026-10-09

`scripts/verify-patient-compose-startup.js`를 구현하고 실행했다. 별도 무작위 Compose project·volume·임시 독립 secret 파일만 생성, base/preparation/patient overlay를 실제 Docker Compose로 조합했다. 기존 Control 파일 mount/start → stop → preparation preflight/apply → 재적용 거부 → 환자 Control 전체 entrypoint/전용 DB LOGIN/health ready → A 정상 주체의 잘못된 본문400/B 주체의 A wrap 호출403 → 중복 A/B secret 시작 거부 → 기존 격리 Control health200을 확인했다. **7항목 PASS/193.687초/exit0**, artifact `artifacts/workstation/hp-patient-startup-3b15db4ee33b.json`, cleanup=true. Docker label 및 volume project prefix 확인 후 생성한 자산만 제거했고 secret 파일도 개별 삭제했다. 각 Docker/Compose 명령60초, Compose wait45초, HTTP3~5초 제한; command timeout을 정책 DENY로 판정하지 않는다.

후보 `highpass-platform-mvp:capstone-patient-startup-20261009` / `sha256:fedbae566527f479bda3498114a45b7878b5019c490959347d90e33f2752ec28`, 기존 a548 base ID 전후 일치·network-none build exit0. preparation helper/entrypoint/Control entrypoint/secret loader4개 source SHA 일치 PASS. Trivy HIGH0/CRITICAL0·Container Gate PASS/exit0 (`artifacts/security/container-scan/patient-startup-20261009.json`, 2026-10-09T14:24:23Z). 이미지는 preparation/runtime 코드 기준이며 이후 추가한 host verifier·문서 자체를 포함한다고 주장하지 않는다. 실행 후 verifier의 secret cleanup 실패 표시를 보강했고, 이 미실행 실패 분기는 문법 검증 범위로만 남긴다.

선택10/10 PASS/192.117ms/exit0, secret findings0·문법/diff PASS. 이번에는 전체 Node를 다시 실행하지 않았고 이전843/843 결과는 당시 회귀로 유지한다. 이번 실제 시작은 격리 Compose·실제 파일·SQL·Control 기준이지만 **public TLS·실제 Azure·환자/ref 등록·환자 브라우저 정상 열람·실제 배포 DB·rollback** 증거가 아니다. 발표용 A/B/Cloud 서비스는 변경하지 않았다. 신규 증적 DRAFT / UNASSIGNED, 변경 미커밋, 전체 MVP/v3 미완료.

**다음 작업 한 개: 환자 웹/모바일의 기존 예시 canvas를 승인된 본인 Grant→암호화 Gateway→실제 CT/MRI Viewer 경로로 연결하고 같은 UI에서 정상·거부 검증.** 실제 배포 활성화 전에는 소유 ref의 명시적 등록과 최신 증적 독립 검토를 유지한다.

### 환자 DB 준비 도구와 동일 전용 LOGIN 검증 — 2026-10-09

`prepare-capstone-patient-database.js`와 공유 preparation helper, operator-only `capstone-patient-preparation.compose.yml`을 구현했다. 기본 rollback-only preflight, 명시적 `--apply`에서만 migration033~036·`hipass_patient_authority` LOGIN/최소권한 생성. 고정 객체명·bound password format·transaction advisory lock·lock2초/statement5초, 기존 계정/부분 객체는 수정하지 않고 중단한다. admin 파일은 준비 컨테이너에만 readonly mount하며 Control에는 추가하지 않는다. 환자/소유 ref 자동 seed·실제 DB 실행·배포는 없음. PostgreSQL 최소권한 스킬에 따라 선택된 column/table 권한만 부여한다.

실제 격리 PostgreSQL verifier가 이제 이 preparation helper를 사용한다. preflight 무변경 → migration 두번째 단계의 의도된 실패/rollback → fresh 적용 → 다른 password 재적용 거부/기존 상태 보존 → **바로 이 전용 LOGIN으로 runtime 시작·metadata UPDATE/superuser 거부·복구**를 검증했다. `node scripts/verify-patient-self-view-postgres.js`: **17항목 PASS/12.390초/exit0**, grants4/audits53/proofs5·cleanup=true. 실제 파일 mount·전체 Control entrypoint·배포 DB·public TLS·브라우저 성공 증거는 아직 아니다. 암호화 LOCAL_RSA_FIXTURE / ONE_PIXEL_PNG_FIXTURE.

선택5/5 PASS/151.7233ms, preparation profile Compose JSON 검사(default preflight/admin 미전달/비공개 네트워크/readonly) PASS/exit0. 전체 Node **843/843 PASS/42.0272789초/exit0**, `artifacts/workstation/patient-preparation-node-regression-20261009.log`; Secret findings0·문법/diff PASS. 새 scripts는 기존 `6953a827…` image에 없으므로 재빌드 전 준비 container를 실행하면 안 된다. 변경 미커밋, 신규 증적 DRAFT / UNASSIGNED, 전체 MVP/v3 미완료.

**다음 작업 한 개: 새 소스 이미지와 실제 readonly secret mount로 격리 Compose의 preparation→Control 시작을 검증하고 환자 Viewer 연결을 진행.** 실제 활성화·rollback·합성 계정/ref 등록·브라우저 정상/거부·독립 검토는 남아 있다.

### 환자 배포 overlay 및 격리 시작 재검증 — 2026-10-09

명시적 `infra/azure/capstone-control-patient.compose.yml`을 추가하고 `.env.example`에 외부 secret 파일 경로를 명시했다. 기존 base Compose 기본 비활성 유지, 환자 전용 LOGIN 이름·독립3개 readonly 파일·versioned Vault key 설정이며 Control에 Vault identity/DB admin key/새 공개 포트를 넣지 않는다. PostgreSQL 최소권한 스킬을 적용했으며 실제 운영 DB/권한/환자 ref는 수정하지 않았다.

선택6/6 PASS/224.917ms/exit0. 실제 `docker compose config --format json`에서3개 readonly mount·Control/DB 무공개 포트·필수 key 누락 거부 PASS/exit0; 합성 URL과 validation-only 경로를 사용했고 서비스 시작 없음. `node scripts/verify-patient-self-view-postgres.js` **16항목 PASS/17.788초/exit0**, grants4/audits53/proofs5·cleanup=true. 실제 격리 SQL의 최소권한 LOGIN runtime, metadata UPDATE/superuser 시작 거부 및 복구 포함. 이 결과는 기존 verifier의 localhost 전용 LOGIN 기준으로, 새 overlay의 `hipass_patient_authority` 계정/파일 mount를 사용한 실제 서비스 시작 검증은 아니다. 암호화 LOCAL_RSA_FIXTURE / ONE_PIXEL_PNG_FIXTURE, public TLS/Azure/브라우저 증거로 승계하지 않는다.

전체 Node **839/839 PASS/42.1160627초/exit0**, `artifacts/workstation/patient-compose-node-regression-20261009.log`. Secret findings0/diff 검사 PASS. 앞선 후보 `6953a827…`의 런타임 JS는 그대로지만 이번 overlay·env example·test·문서는 이미지 빌드 이후 추가이며 포장 완료 주장과 구분한다. 변경 미커밋, 신규 증적 DRAFT / UNASSIGNED, 전체 MVP/v3 미완료.

**다음 작업 한 개: migration033~036·전용 LOGIN 최소권한의 명시적 배포 준비 도구와 격리 파일-mount 시작 검증.** 자동 계정/소유 ref seed와 실제 활성화는 아직 없으며, 신규 증적 독립 검토 및 실제 배포·rollback·환자 Viewer 종단검증이 남아 있다.

### 최신 커밋 소스 후보 이미지 검사 — 2026-10-09

소스 HEAD `30de0b39701fd4088d6a1bc740f8bd6e64b7879d` 기준 후보 `highpass-platform-mvp:capstone-patient-config-30de0b3` / `sha256:6953a8273f67d63cf4cf143fe04ec638827cbf54b3c371a51aa2cf7f5ad4f76f`를 빌드했다. 기존 base `a5487906…` 태그의 빌드 전후 ID 일치, `--pull=false --network=none`, 120초 상한, exit0. 최초 bare image ID FROM 시도는 레지스트리 이름으로 해석돼 exit1이었으며 성공으로 기록하지 않는다.

환자 런타임 설정·entrypoint·암호화·인가·Grant runtime·release·worker·SQL verifier·모바일 JS·migration036의 **선택10개 파일 local/image SHA 일치 PASS/exit0**. 최초 검증은 잘못 지정한 migration 파일명으로 exit1, 다음은 distroless PATH에 `node`가 없어 exit127이었다. 실제 이미지 entrypoint `/nodejs/bin/node` 확인 후 network-none/read-only/cap-drop/no-new-privileges 컨테이너에서 성공했다. 전체 파일 트리 일치 또는 실제 서비스 시작 증거는 아니다.

고정 Trivy 0.58.2 digest로 정확한 후보 이미지 스캔 **HIGH0/CRITICAL0, Container Gate PASS/exit0**, 증적 `artifacts/security/container-scan/patient-config-30de0b3.json` (2026-10-09T14:09:25Z). 이전 후보 `3fdee566…`는 이력으로만 유지한다. 이미지 빌드·검사만 수행했으며 A/B/Cloud 서비스·DB·volume·환자 런타임 활성화는 변경하지 않았다. 신규 증적 DRAFT / UNASSIGNED, 전체 MVP/v3 미완료.

**다음 작업 한 개: 전용 환자 DB 계정·migration·외부 secret mount의 기존 배포 계약 정렬 및 시작 검증.** 실제 환자 브라우저 Viewer 연결과 정상·거부 종단검증은 그 뒤에 같은 흐름으로 완료해야 한다.

### 최신 커밋 전 회귀 및 런타임 설정 — 2026-10-09

환자 런타임은 기본 비활성을 유지한다. 활성화 시 전용 `hipass_patient_authority` DB 연결과 외부 파일의 환자 A/B 서비스 자격증명을 읽으며, 기존 의료진·DB·발표 키 재사용과 잘못된 프로필은 시작 전에 거부한다. 실제 배포 DB 계정 생성·migration·서비스 활성화는 수행하지 않았다.

`node --test --test-concurrency=4 --test-reporter=spec --test-reporter-destination=artifacts/workstation/patient-config-node-regression-20261009.log`: **838/838 PASS, 41.9254432초, exit0**. Secret 패턴 검사 findings0 및 staged diff 검사 exit0. 증적은 로컬 ignored artifact이며 clone에 포함되지 않는다. 아래 `3fdee566…` 후보 이미지는 이 런타임 설정 추가 이전 빌드이므로 최신 소스 이미지로 승계하지 않는다. 신규 증적 DRAFT / UNASSIGNED.

사용자의 커밋·푸시 지시에 따라 소스·테스트·문서를 기록한다. VM 설정·배경 이미지·인증정보·영상 payload·실행 artifact는 이번 커밋에서 제외한다. **다음 작업: 최신 소스 후보 재빌드·검사 후 전용 계정/내부 자격증명 배포 준비와 환자 웹·모바일 실제 Viewer 연결.** 실제 배포 환자 브라우저 종단 검증과 전체 MVP/v3는 미완료다.

### 최신 실제 합성 CT/MRI 환자 암호화 전달 — 2026-10-09

실행 명령 `patient-vault-integration-ops.py --phantom CT`와 `--phantom MR` 각각 exit0. 격리 SQL의 Study/Series/owner ref를 실제 합성 PHANTOM UID에 바인딩했으며 실행 Cloud DB/환자 매핑을 수정하지 않았다. A VM은 현재 Docker private PACS proxy 주소를 inspect로 확인하고 기존 CA·gateway client cert/key·고정 servername을 유지해 QIDO/WADO를 mTLS로 조회했다. 개인키/DEK는 각 VM에 유지, A에서 실제 pixel 암호화 후 B에서 실제 Azure unwrap·AES-GCM 복호화. QIDO의 정확한12 SOP 목록, 첫째·둘째 SOP의256×256 및 서로 다른 pixel 확인. 12장 전체 pixel/브라우저는 시험하지 않았다.

CT: SQL17항목 PASS/22.163초, `artifacts/workstation/patient-vault-20261009T135220Z-faa981f36441/result.json`. MR: SQL17항목 PASS/28.106초, `…T135356Z-cf2d98b82bf3/result.json`. 각각 grants4/audits59/proofs6, hash chain/cleanup PASS. 재사용 B authorize403, 변조·DPoP 재사용·철회 후 신규 접근 거부 및 **VM actual PACS rendered read counter가1→두번째 정상에서2→철회 후2 유지**. 기존 A/B image/healthy 보존, owned source stage 제거 PASS. worker source127개 aggregate `f883cba35d094b078a0e9f78fdf6af14e899164d3d9818780e08532f6cc53cdb`. 초기 CT FAIL `…T134945Z-671daef3f66e`도 보존: 당시 loopback PACS 주소 사용, raw transport code 미포착; current private proxy 주소 적용 후 PASS이며 최초 하위 오류를 connection refused 등으로 확정하지 않는다.

최신 후보 `highpass-platform-mvp:capstone-patient-pacs-20261009` / `sha256:3fdee566d545839ad4f5cb31070d3820c32f5ae9008c32a66ca4bb5079318c54`, 빌드exit0, source10개 local/image SHA 일치 PASS. 정확한 digest Trivy HIGH/CRITICAL0 및 Container Gate PASS. 전체 Node **833/833 PASS/45.373618초/exit0**, `patient-pacs-node-regression-20261009.log`. 중간 image d4b220f3은 당시 후보 이력이지 최신 source 전체 증거가 아니다. PostgreSQL 스킬의 bound query·기존 최소권한 적용, 운영 DB/권한/VM 서비스 재배포 없음. 신규 증적 DRAFT / UNASSIGNED, 변경 미커밋.

**다음 작업 한 개: 검증된 후보의 capstone patient runtime/전용 계정·내부 credential 활성화와 환자 웹·모바일 actual Viewer 연결**. 현재 시험은 실제 PACS/Vault이지만 격리 SQL·loopback A/B handler·SSH tunnel이며, 실제 public edge·환자 로그인/브라우저 Viewer·최종 전체 MVP/v3 완료가 아니다. Windows 시간서비스 복구와 최종 독립 검토는 계속 미완료다.

### 최신 실제 환자 Key Vault·격리 SQL 연결 — 2026-10-09

실제 VM-local patient 암호화 adapter → 기존 Azure RSA-OAEP-256 → 격리 SQL release precheck/consume → B AES-GCM 복호화·원본 1픽셀 PNG 무결성 PASS. `patient-vault-integration-ops.py` exit0, 전체 wrapper7항목 PASS 및 SQL16항목 PASS/21.806초(grants4/audits53/proofs5, cleanup=true). source127개 SHA aggregate `a2615801660d5c14a9603579b5fc3f60fe802764839bad0ac9a1702996420f19`; A/B 신원·소스 일치, 기존2c7b3664/940806f6 image/running/healthy 보존, 신규 owned source stage 정리 PASS. 재사용은 B Control authorize403/KV_POLICY_DENIED, DPoP 재사용·토큰 변조·SQL 철회 후 신규 조회의 PACS fixture 증가 없음 및 기존 감사 chain 확인. 기존 서비스/DB/volume/권한은 변경하지 않았다. 증적 `artifacts/workstation/patient-vault-20261009T134121Z-8d5e2b463965/result.json` — DRAFT / UNASSIGNED.

초기 실행3건 FAIL을 삭제하지 않았다: `patient-vault-20261009T133234Z-dc75f7d55a43`, `…T133415Z-98767e1591e2`, `…T133544Z-ebd479ab540e`. 마지막 진단의 모든 scope 비교 true, A VM 잔여32552ms/관측 clock delta약-2.6초였다. 준비 영수증에 issuedAt를 서명 결속해 **deadline-issuedAt≤30초**를 검증하도록 수정했다. Gateway absolute expiry, Control의 MAC/현재시간/철회/권한 및 pre/post unwrap 검사 유지. 선택19/19 PASS/585.3222ms, 공식 동시성4 전체 Node **833/833 PASS/44.491868초/exit0** (`patient-vault-node-regression-20261009.log`). 발급시각 누락·30초 초과 거부, receiver clock뒤처짐에도 Control 만료 거부 테스트 포함. Windows w32time은 stopped이며 일반 권한의 Start-Service는 실패; A/B는 NTP=yes/NTPSynchronized=yes. Windows 시간서비스 복구는 발표 사전점검 미완료 항목으로 남기고 관리자 실행 결과를 요청했다.

이 결과는 실제 Vault지만 **PACS가 아닌1픽셀 PNG·loopback A/B HTTP handler·격리 SQL·SSH tunnel** 범위다. 실제 환자 CT/MRI/browser/public TLS/배포/전체 MVP 완료 주장이 아니다. 후보 image56405f81은 이번 issuedAt 변경 이전으로 이 소스의 배포 증거로 승계하지 않는다. **다음 작업 한 개: 최신 소스로 후보 이미지 재빌드·스캔하고 실제 합성 CT/MRI를 patient Grant/Viewer 경로에 연결**한다. 신규 증적 독립 검토 미완료, 이번 변경 미커밋이다.

### 최신 실제 병원 인증·Azure 역할 사전확인 — 2026-10-09

`scripts/patient-key-identity-inventory.py`는 VMware 관리 채널의 공개 host key로 SSH를 pin하고 concealed stdin만으로 인증한다. 서비스/DB/인증서/권한을 변경하지 않는다. 실제 A runtime `2c7b366483f1…`와 B `940806f602ec…` running/healthy, 각 VM에서 실제 인증서 Entra HTTP200 및 등록 tenant/clientId 일치 **4항목 PASS/exit0**. 이전 batch public-key 거부를 VM 불능이나 자격증명 만료로 해석하지 않는다. 최종 증적 `artifacts/workstation/patient-key-inventory-20261009T132615Z/result.json`, DRAFT / UNASSIGNED. 초기 동일 실행의 신원 결속 미확인 결과는 `…T132447Z/result.json` 이력으로 보존한다. private key/assertion/access token/VM 암호를 결과 파일에 저장하지 않는다.

Azure CLI 읽기 전용 조회 exit0: 지정 Key scope에서 A/B principal의 등록 custom-role 할당 확인. A role dataActions는 keys/read + keys/wrap/action, B는 keys/read + keys/unwrap/action이며 관리 actions는 비어 있다. 이는 이 두 직접 역할의 구성 확인이지 모든 group/inherited 유효 권한 부재나 실제 역방향 호출 DENY의 신규 증거는 아니다. Python 문법·secret scan(findings0)·diff 검사 PASS. 신규 inventory 도구는 기존 candidate 이미지의 런타임 검증 범위에 자동 포함시키지 않는다.

**다음 작업 한 개: 격리 SQL 환자 authority/HTTP release를 실제 VM-local patient 암호화 adapter와 연결하는 검증 harness.** A/B identity key는 각 VM 안에 유지하고 raw DEK를 host/Control에 반환하지 않는다. 새 후보를 운영 서비스로 교체하기 전에 실제 wrap/unwrap·환자 release consume·무결성·철회·감사 실패를 함께 검증한다. 현재 actual patient Vault/배포/환자 CT-MRI Viewer는 NOT VERIFIED, 전체 MVP/v3 미완료다. 기존 의료진 crypto PASS를 승계하지 않는다.

### 최신 환자 통합 후보 이미지 — 2026-10-09

`Dockerfile.patient-capstone`으로 기존 a5487906 런타임에 src/scripts/db/public/config를 함께 복사했다. dependency 재설치·서비스 재배포·DB migration 없이 candidate `sha256:56405f81e58551a2651af078869ce550231b09abe0f35997e3e4f479dc9462c9` 빌드 exit0, 핵심 소스7개 local/container 해시 일치 PASS, 포장검사1/1 PASS. 정확한 image digest의 Trivy HIGH/CRITICAL 0 및 Container Gate exit0/PASS. 공식 package 테스트 설정과 동일한 `node --test --test-concurrency=4` **831/831 PASS/42.6667936초/exit0**. 앞선 기본 동시성 실행은830/831, Privacy HTTP 1개 FAIL(46.825211초)이었고 단독2/2 PASS(7.047745초); 최초 FAIL을 보존하며 원인은 NOT VERIFIED다. timeout/정책/fixture 변경 없음. 증적 `artifacts/workstation/patient-candidate-20261009.json` DRAFT / UNASSIGNED.

실제 읽기 전용 Cloud 조회는 기존 auth-denial image의 Control·PG healthy를 확인했다. A SSH는 strict host 검증 후 비대화형 public-key 인증 거부여서 VM/Vault 재검증으로 승계하지 않는다. **다음 작업: 기존 concealed VM 인증 경로로 A/B를 재확인하고 이 후보의 실제 patient Azure wrap/unwrap 검증을 실행한다.** 후보는 미배포·flags 미활성이고 신규 코드/문서는 미커밋이다. 환자 브라우저 CT/MRI·전체 MVP/v3는 미완료다.

### 최신 로컬 환자 런타임 시작 검증 — 2026-10-09

코드 기준 `d0b979e15feb725572a5e895bb6577f4a332eced` + 이번 verifier/document dirty. 커밋·푸시는 직전 단계에서 완료했으며 이번 변경은 미커밋이다. `node scripts/verify-patient-self-view-postgres.js` exit0, **16개 확인 항목 PASS/20.542초**, grants4/audits53/proofs5, cleanup=true. 기존 SQL/HTTP/A/B AES-GCM·로컬 RSA·1픽셀 PNG fixture 흐름에 실제 별도 LOGIN을 추가하여 runtime 시작, metadata UPDATE 권한 부여 시 거부, superuser 시 거부, 권한 회수 후 시작 복구를 검증했다. PostgreSQL 스킬의 최소권한 지침에 따라 임시 DB 안에서만 권한을 변경하고 종료 시 제거했다. 경로의 공백 인코딩은 `fileURLToPath`로 처리했다. Secret findings0, 문법/diff 검사 exit0. 증적: `artifacts/workstation/patient-runtime-startup-20261009.json` — DRAFT / UNASSIGNED.

**다음 작업 한 개: 기존 A/B 인증서를 그대로 안전하게 사용하는 실제 Azure patient wrap/unwrap 검증과 후보 배포 준비.** 실제 Vault·public TLS·실행 DB startup·환자 CT/MRI 브라우저는 NOT VERIFIED다. 이번 시험은 VM/Cloud/실행 DB를 변경하지 않았고 전체 MVP/v3 완료가 아니다. 아래 “다음 작업”은 해당 단계 당시 이력이다.

### 커밋 전 로컬 통합 확인 — 2026-10-09

`node scripts/verify-patient-self-view-postgres.js` exit0, 15개 확인 항목 PASS, 20.528초, grants4/audits53/proofs5, cleanup=true. 실제 격리 PostgreSQL·JWT/DPoP·Control HTTP·A/B handler와 AES-GCM/로컬 RSA fixture를 연결하고 재사용·변조·철회 후 PACS fixture 조회 증가 없음 및 감사 chain을 확인했다. PACS 응답은 1픽셀 합성 PNG이며 실제 Azure Key Vault·TLS·배포·CT/MRI·브라우저 종단 증거가 아니다. 신규 증적은 DRAFT / UNASSIGNED이며 전체 MVP/v3 완료로 승격하지 않는다.

## 현재 상태 — 단일 사용자 흐름 우선 / 2026-10-09 환자 capability 최종 회귀 반영

이 절이 발표 환경의 현재 상태 권위 위치다. 아래 `과거 이력`의 현재·미배포·실행 중 설명은 당시 기록이며 현재 상태로 해석하지 않는다. 기존 v3 Acceptance/P0 조건은 축소하지 않는다.

- 코드 HEAD: `089eecb5cd479a12aab28f4c92804e23dd101be0` + dirty. HEAD만으로 재현 불가. 로컬 환자 self-view policy는 런타임 비활성이다.
- B: 실제 읽기 전용 inventory `mobile-b-rollout-20261009T101501Z/result.json`으로 image `sha256:940806f602ec282d6d03a9da6948b6a8453bb47ff9f71fdadb8aa40fa5521aea`, healthy·암호화 필수 모드 확인. HTTPS 정적 자산 11/11 로컬 해시 일치: `presentation-ui-inventory-1791540594369/result.json`.
- Cloud: 현재 `highpass-platform-mvp:capstone-auth-denial-20261009` / `sha256:a54879068331c235fbd9636b899717fd06b5682ccf07ea9605a0a87ee1178783`. `cloud-app-rollout-2026-10-09T11-03-10.202598+00-00/result.json`에서 실제 image pin/소스8개/healthy/기존 환경·mount·port 보존과 4315941d rollback·재적용 확인. 앞선 `phantom-catalog-live-1791540950869/result.json`은 이전4315941d에서 합성 catalog 멱등 등록 addedStudies=0 시험이며 현재 이미지의 새 등록 시험은 아니다.
- A: `phantom-source-2026-10-09T10-15-45.968073+00-00/result.json`의 verify-only로 Gateway `2c7b3664…`, PACS `9f74f2db…`, private network·proxy health와 합성 CT12/MR12의 mTLS WADO 무결성·256×256 확인. 원래 28 Instances 유지, added/deleted=0.
- 개발용 CA/server/client 로컬 인증서 만료: 2026-12-07 08:18:39 KST. 실서비스 peer 전체 인증서 inventory는 별도 미검증; 실제 HTTPS와 A mTLS 경로는 검증을 완화하지 않고 실행했다.

### 최신 MRI 결과 — 같은 Cloud/B 조합의 정상·거부 종단 검증 완료

제품 코드·이미지·권한·TTL·TLS는 변경하지 않았다. 기존 mobile verifier의 고정 CT UID를 명시적인 CT/MR 합성 두 Study 선택으로 보강하고, wrapper의 VerticalFlow에서만 `-PhantomModality MR`을 허용했다. MRI 승인 시험에서는 CT를 범위 밖 Study로 시험하며 임의 UID/실환자는 허용하지 않는다. 기본 CT 모드는 유지한다.

- 명령: `powershell -NoProfile -File scripts/run-browser-authorization-trace.ps1 -Port 9228 -Capstone -MobileQr -VerticalFlow -PhantomModality MR -BrowserUrl https://192.168.111.149:9443/hipass/`, exit0, **169.684초**. `artifacts/workstation/b-browser-2026-10-09T11-14-01.907942+00-00/result.json`: 같은 합성 환자의 새 MRI 동의·Ticket → 실제 의료진 버튼 → 정확한 MR12 SOP/256×256/다음 슬라이스 → 모바일 철회·서버 거부·픽셀 제거 PASS. 9개 추가 음성 조건의403·감사 증가·token111/releases279/소비192·동의/scope 불변·영상/토큰 반환 없음 PASS. 의도된 DPoP 최초 정상 QIDO 이후 성공 기록 기준1735에서 재사용 증가0을 확인했다.
- 기존 Azure CLI Python의 `scripts/capstone-phantom-audit-check.py <위 MRI receipt>`, exit0: `artifacts/workstation/phantom-audit-2026-10-09T11-14-10.090603+00-00/result.json`. 같은 동의/인증 actor의 세 identity 거부 각1, bound probe session의 Study/Series/permission/철회/DPoP 거부 확인. UI token Vault 발급5/소비5·wrap/precheck/consume 연결·hash chain6328 PASS. Cloud 원본 저장이나 Azure provider 서비스 로그 검사 증거는 아니다.
- 선택 Node3/3 PASS/exit0(150.048ms), JS 문법·diff check·secret scan findings0 PASS. 이번에는 전체 Node를 다시 실행하지 않았다. 바로 앞 제품 코드 기준775/775 PASS는 아래43.332초 실행으로 구분한다. 생성 동의 정확한 cleanup과 wrapper 소유 Chrome 종료 PASS; 시작한 명령은 모두 종료했다.

이제 최신 Cloud a5487906/B940806f6 조합에서 **CT와 MRI 각각의 지정 사용자 흐름 정상·거부 검증** 증적이 있다. 두 실행은 각자 새 consent/Ticket이며 하나의 다중 Study 동의·v3 Grant 시험이 아니다. 카메라 스캔·네이티브 생체인증·환자 본인 실제 픽셀·영상 토큰 실시간 만료·패킷 경계·최종 재시작·전체 security gate·독립 사람 검토·전체 v3는 아직 미완료/미검증이다. 신규 증적 DRAFT / UNASSIGNED, 전체 MVP 완료 아님. 관련 FR-001~005/010~036/037~041의 해당 기술 시험 범위에만 대응한다.

다음 작업 한 개: **환자 본인 CT Grant 저장을 기존 감사 hash chain/saveQueue와 안전하게 연결하고 DPoP 발급까지 검증**한다. 사용자 “권고안 실행”으로 S1 방향을 채택했다. 현재 환자 웹/모바일 canvas는 모의 그림이며 의료진 성공을 본인 열람 성공으로 승계하지 않는다. 새 의료진 권한 주입/가짜 병원 간 동의/암호화 우회 없이 authority·소유권·키 발급 분리를 유지한다.

### 이번 로컬 하위 작업 — Grant 저장 경계 / DRAFT · UNASSIGNED

환자 crypto adapter 추가 후 최종 전체 Node **830/830 PASS/exit0/42.1112171초**. 최신 소스 SHA·명령·fixture 한계: `artifacts/workstation/patient-crypto-local-20261009.json`. Secret findings0(2026-10-09T13:07:54.601Z), 문법/diff 검사 exit0. 아래826/826 이하는 이전 단계 이력이다.

**최신 환자 crypto A/B adapter 로컬 구현**: patient-encrypted-transfer.js의 별도 PATIENT_IMAGE manifest와 AES-GCM AAD를 만들고 기존 Azure RSA-OAEP-256 protocol client를 재사용했다. consentId surrogate 없이 Grant/actor hash/기관/Gateway/감사 세션/path/SOP/deadline·원본 hash와 cipher/manifest/wrapped-key hash를 결속한다. B는 원래 요청 token hash도 비교하며 별도 patient HTTP release의 pre/post unwrap·원자적 consume을 요구한다. explicit A/B crypto profile에 연결했으나 flags는0/실행 VM 변경 없음. 선택17/17 PASS/exit0/458.1245ms: 실제 로컬 RSA/AES 연산 왕복·변조·다른 token/SOP/type·재사용·unwrap 중 철회·audit 장애·B 전용 pixel branch/transient output 정리. **RSA fixture는 Azure 서비스가 아니고 auth/ledger는 doubles, body는 합성 bytes여서 실제 SQL+crypto 종단/PACS pixel/VM/브라우저 증거가 아니다**. 다음 작업 하나는 실제 SQL/HTTP/crypto를 한 흐름으로 연결하고 실제 Key Vault 및 후보 A/B 배포 검증으로 넘어가는 것이다. 관련 FR-014~036/037~041. 신규 증적 DRAFT / UNASSIGNED, 전체 MVP/v3 미완료. 이번 변경 commit/push/배포 안 함.

환자 release HTTP 추가 후 최종 전체 Node **826/826 PASS/exit0/42.5657779초**. 최신 source SHA·시험 경계: `artifacts/workstation/patient-release-http-20261009.json`. 아래824/824 이하와 “HTTP 미연결”은 이전 단계 이력이며, 위 handler의 loopback 범위만 해소됐다. public edge/실제 runtime/crypto 완료로 승계하지 않는다.

**최신 환자 KeyRelease A/B HTTP 인증 경계**: 새 B internal service key는 patient-package-key-release scope와 고정 hospital-b-portal 신원만 제공한다. A/doctor/generic/다른 key와 동일값을 거부한다. patient release handler는 A wrap/prepare와 B authorize를 분리하고 body 추가 신원·권한 속성을400으로 거부한다. server/runtime에 default-off 연결했고 opt-in에는 versioned key·036 ledger와 SELECT/INSERT/상태 column UPDATE, metadata UPDATE/DELETE 부재를 확인한다. PostgreSQL skill의 최소권한 기준을 사용했다. 실제 DB+loopback HTTP14항목 PASS/exit0/23.774초(grants4/audits42/proofs4, cleanup=true), 선택16/16 PASS/exit0/453.1231ms. no-store·32KiB·strict UTF8·5초 body deadline·서비스 scope/subject/authMethod/source·403/503 구분을 구현했다. 실제 dedicated login startup·public TLS edge·patient Key Vault/암호화 pixel·VM 배포는 아직 미완료/미검증이다. Secret findings0(2026-10-09T13:01:17.873Z), JS문법/diff 검사 exit0. 기존 실행 DB/VM/Cloud 변경 없음. 다음 작업 한 개: **patient Azure encrypt/decrypt adapter를 이 release 계약에 연결하고 실제 pixel 전달을 검증**한다. 신규 증적 DRAFT / UNASSIGNED. 전체 MVP/v3 완료 아님.

환자 KeyRelease ledger 추가 후 최종 전체 Node **824/824 PASS/exit0/42.6108249초**. 최신 source SHA와 증거 한계: `artifacts/workstation/patient-key-release-ledger-20261009.json`. 아래819/819 이하의 실행은 이전 코드 이력이다.

**최신 환자 KeyRelease policy/실제 SQL 경계**: HEAD `b53ee06e6a93ed4da7716cc5c5d14dc48cee3abd` + 이번 변경 dirty. Git fetch의 자동 maintenance는 종료 exit0, 직전 체크포인트 push 완료를 확인했다. `PatientBoundKeyRelease`·별도 ledger migration036·bound repository를 구현했다. 영수증과 current patient authority·SOP·Gateway·3개 package hash를 결속하며 PENDING은 감사 저장과 live 재검증 후에만 PREPARED로 활성화한다. PRECHECKED 이후 atomic consume은 한 번만 성공하고 감사 실패 후 상태를 되돌리지 않는다. 별도 PG 역할은 SELECT/INSERT와 status/consumed_at UPDATE만 부여했다(격리 시험 역할; 실행 DB 변경 없음). 선택14/14 PASS/exit0/179.4697ms, 최종 실제 격리 PG13항목 PASS/exit0/15.652초(grants4/audits39/proofs4, cleanup=true). 먼저16.046초 PASS 후 중앙 감사 enum 적용 기준으로 재실행했다. DB 재조회 hash chain 확인, SQL 합성 철회·hash 변조·precheck 전 소비 거부·동시 consume 한 건·감사 장애 PENDING 확인이다. 실제 Azure patient wrap/unwrap·HTTP release 인증 경계·A/B listener·환자 Viewer는 아직 미완료/미검증이다. 준비 감사와 상태 변경은 단일 transaction이 아니고 fail-closed orphan 상태를 허용하며 전체 HA/정확히 한 번 전달 주장을 하지 않는다. 관련 FR-014~025/026~036/037~041. Secret findings0(2026-10-09T12:56:13.858Z), 문법 검사 exit0. 다음 작업 한 개: **전용 A/B release 인증 경계와 patient Key Vault adapter를 연결해 실제 암호화 pixel 전달**. 신규 증적 DRAFT / UNASSIGNED, 이번 추가 변경 commit/push/배포 안 함.

환자 A/B transport 추가 후 최종 전체 Node **819/819 PASS/exit0/42.6429015초**. 소스 hash·시험 경계·미완료 범위: `artifacts/workstation/patient-transport-local-20261009.json`. 아래811/811 및808/808은 이전 구현 상태의 회귀 이력이다.

**최신 환자 A/B transport 로컬 구현**: A 전용 handler와 default-off listener 분기를 연결했다. 별도 credential/type/source/Study/Series의 authorize 결과와 patient ready 영수증을 사용하며 PACS에 browser token/proof를 전달하지 않는다. metadata에서 정확한 UID 행·허용 tag/VR/Value만 남겨 이름·생년월일·private tag·BulkDataURI를 제외한다. 환자 encryption adapter 없는 픽셀은 PACS 조회 전에503이고 doctor encryptor로 대체하지 않는다. B portal도 default-off patient metadata proxy를 추가했으나 실제 listener flag 활성화는 아직 없다. 환자 픽셀은 별도 KeyRelease 미준비로503, 기존 doctor decryptor를 사용하지 않는다. 최대25초 crypto deadline/abort와 transient input buffer 정리, 준비/audit 실패 시 bytes 미반환을 시험했다. 선택22/22 PASS/exit0/473.3861ms, secret findings0(2026-10-09T12:45:52.578Z), JS문법/diff 검사 exit0. 시험은 injected transport/PACS/crypto doubles 및 B loopback HTTP이며 **실제 A PACS·patient Key Vault·VM/TLS 활성화·브라우저 환자 CT/MR 증거가 아니다**. Cloud/A/B 배포·DB/volume 변경 없음. 관련 FR-026~036/014~025/037~041. 다음 작업 한 개는 **환자 authority에 결속된 Key Vault package/release를 연결하여 A/B pixel 경로를 완성**하는 것이다. 신규 증적 DRAFT / UNASSIGNED.

준비 영수증 추가 후 최종 전체 Node **811/811 PASS/exit0/42.2133832초**. 실행 범위·소스 SHA-256·미검증 항목은 `artifacts/workstation/patient-preparation-receipt-20261009.json`에 기록했다. 아래808/808은 이전 metadata gate 상태의 이력이다.

**최신 환자 준비 영수증 경계**: `/gateway/patient-self-view/ready`를 default-off runtime에 연결했다. 별도 process-local HMAC·path/token-hash/claims/kid·최대30초 deadline 결속, 내부 전용 caller 확인, live ledger/소유권/키 상태 확인 및 감사 저장 후 재확인을 구현했다. raw token/proof를 영수증에 포함하지 않으며 재시작에는 진행 중 영수증이 무효다. 준비 확인은 전달 완료·암호문 hash 결속·Key Vault consume·API HA 증거가 아니다. 선택9/9 PASS/exit0/211.0178ms, 실제 격리 PG12항목 PASS/exit0/21.015초(grants4/audits27/proofs3, cleanup=true). SQL 상태 주입을 환자 철회 UI로 해석하지 않는다. Secret 검사 findings0(2026-10-09T12:39:36.074Z), 문법 검사 exit0. 이번 skill 적용은 기존 SQL bound 조회·최소권한을 유지한 것이며 운영 DB 권한을 확대하지 않았다. Cloud/A/B 배포·기존 데이터 변경 없음. 다음 작업은 이 준비 영수증을 실제 A/B patient transport와 별도 암호화/Key Vault release 경계에 연결하는 것 하나다. 신규 증적 DRAFT / UNASSIGNED.

**환자 metadata gate 최종 결과**: 전용 호출자는 scope뿐 아니라 실제 `INTERNAL_SERVICE_TOKEN` 인증 방식과 `patient-self-view-gateway` subject도 요구한다. TEST JWT로 내부 service를 위장한 호출은 거부한다. 최종 선택11/11 PASS/exit0/211.4929ms, 실제 격리 PG 시험11항목 PASS/exit0/10.667초(grants4/audits23/proofs3, cleanup=true), 최종 전체 Node **808/808 PASS/exit0/43.5658232초**. 아래12.992초·164.521ms는 이 마지막 guard 이전 실행 이력이다. 소스 SHA-256와 미검증 범위는 `artifacts/workstation/patient-gateway-authorization-20261009.json`에 고정했다. 관련 FR-014~025/026~031/037~041의 metadata 인가 범위만 검증했으며, 환자 실제 영상·Key Vault·배포·전체 MVP 완료가 아니다. 기존 PostgreSQL 최소권한 지침을 적용해 별도 service scope와 bound live query를 유지했다. 신규 증적 DRAFT / UNASSIGNED.

**환자 capability 재검증 / metadata-only Control 경로 구현**: `patient-self-view-authorization.js`와 default-off `/gateway/patient-self-view/authorize`를 연결했다. 전용 patient service key는 own scope/source만 가지며 doctor/data-plane/key-release/privacy/internal 키와 동일 값이면 거부한다. 기존 reader에 default-false allowIssuedGrant를 명시적으로 추가해 **실제로 signature와 ledger 검증을 통과한 PATIENT_SELF_VIEW_GRANT 주체**를 원래 TEST JWT로 위장하지 않고 current account/ref/Study/Series/source에 대조한다. token hash·subject·source·Gateway·Study·단일Series·permission·auditSession·issued/expiry·ownership revision을 live SQL로 비교하고 DPoP htu/htm/ath/key/replay를 검증한다. proof·audit 저장 후 권한을 다시 읽으며 inactive/ref 변경은 거부, DB/key/replay 장애는503으로 분리한다. 기존parser 재사용·raw Instance/download/broad Study/encoded invalidUID 차단; Cloud patient-dicomweb 직접 prefix도 명시적으로 차단했다. 이 응답은 최소 scope만 반환하고 raw token이나 영상은 반환하지 않는다.

선택11/11 PASS(164.521ms). 실제 독립 PG/tmpfs 시험도11항목 PASS/exit0/12.992초: 앞선 JWT/HTTP 발급 토큰을 실제 patient reader/nonce ledger에서 재검증하고 GET metadata authorization, 같은proof 재사용, 다른Series, **합성 SQL 상태 주입**의 REVOKED·ownership version 변경 거부 및 DB 재조회 hash chain을 확인했다. 최종 grants4/audits23/proofs3, cleanup=true. 이 상태 주입을 환자 철회 UI/API 검증으로 주장하지 않는다. 내부 authorize HTTP의 실제 production bootstrap/credential activation, A/B clinical transport·환자 Key Vault release·실제 픽셀은 아직 NOT VERIFIED/미완료다. 의료진 기존 Gate를 우회하거나 raw plaintext 경로를 활성화하지 않았고 Cloud/A/B 배포·실행DB는 변경하지 않았다. Secret scan findings0(2026-10-09T12:25:31.083Z), JS문법PASS. 신규 증적 DRAFT / UNASSIGNED.

다음 작업 한 개: **patient-specific A/B metadata·암호화 전송 경로와 readiness/감사 receipt를 연결**한다. 암호화/Key Vault 환자 권한 경로가 준비되기 전 pixel 경로를 공개하거나 doctor release credential을 재사용하지 않는다. 아래 “Gateway 검증 다음”은 이전 상태이며 이번 metadata gate를 전체 영상 Gateway 완료로 승격하지 않는다.

**HTTP 경로 로컬 연결 완료 / 배포 아님**: 새 `patient-self-view-grant-http-handler.js`를 server.js의 기존 API 인증 전 분기에서 연결했다. 기능 off에는404, 활성 상태는 기존 JWT authenticateRequest→server requestMeta/ingressMeta→issuer다. 반환 no-store/no-referrer/no-cache/nosniff·redirect 없음, JSON/UTF-8 2048byte 제한·body5초 deadline, 내부 오류/토큰/proof/private key 진단 비노출, 무인증 거부 감사 실패에는503이다. 별도 `patient-self-view-grant-runtime.js`는 explicit capstone/TEST/strict-DPoP/Postgres/singleWriter profile와 전용 DB URL을 요구하고 관리자·테이블 owner·우회/cluster 특권 role 및 migration 미준비를 startup에서 거부한다. .env.example의 신규 flag는0, 실제 환경변수/DB 역할/등록/Cloud/A/B 배포는 변경하지 않았다. 활성 startup의 실제 dedicated login role 권한·credential/TLS 준비는 아직 NOT VERIFIED다.

실제 독립 PG/tmpfs와 loopback HTTP를 signed ingress 시뮬레이션으로 연결해 **기존 JWT 인증·201발급·무인증401·ingress 누락403·DOCTOR/다른 환자403·body privilege 추가400·grant 불변·DB 감사hash 검증**을 실행했다. `node scripts/verify-patient-self-view-postgres.js` 최종10항목 PASS/exit0/21.867초, grants4/audits17/proofs2, 컨테이너·HTTP listener cleanup=true. 첫21.422초 결과는 인증 거부 감사 callback 추가 전이므로 최종 결과로 구분한다. public HTTPS/실제 edge proxy·배포 결과나 Gateway 소비 증거가 아니다. HTTP 단위5/5 PASS, 기존 Ticket 포함 선택6/6 PASS(661.086ms), 전체802/802 PASS/41.866초는 server close hook 추가 전 실행이다. close hook을 포함한 현재 코드에서 선택6/6 PASS이며 기능 flag는 기본 비활성이다. YAML은 Node parser dependency 부재(MODULE_NOT_FOUND)를 보존하고 기존 Python PyYAML로 parse PASS; 의존성을 새로 설치하지 않았다. Secret scan findings0(2026-10-09T12:11:58.451Z), diff/JS 문법 PASS.

다음 작업 한 개는 **환자 전용 Gateway 토큰 검증·live ledger/소유권 재확인과 제한된 patient-dicomweb 경로를 연결**하는 것이다. 이번 HTTP는 발급까지이며 실제 영상·patient Key Vault release·브라우저 CT/MR·철회/만료 후 pixel 제거·배포·전체 v3는 여전히 미완료다. 기존 의료진 audience/credential·원본 A 보관·Cloud clinical 차단을 유지한다. 아래21:03의 “HTTP 연결 다음”은 이전 이력이다.

최종 close hook/현재 코드 전체 회귀 재실행도802/802 PASS/exit0/41.570초다. `artifacts/workstation/patient-grant-http-20261009.json`에 실제 HTTP SQL 시험과 구현 source hash·검증 범위를 보존했고 hash 대조 PASS다. 해당 source 목록의 server/runtime hash는 구현 식별이며 실제 production bootstrap 성공 증거로 주장하지 않는다. 검증용 컨테이너 label inventory0·cleanup 확인. 최종 상태 신규 DRAFT / UNASSIGNED.

**환자 전용 내부 Grant 발급 구현**: `patient-self-view-grant-service.js`가 엄격한 단일-Series body·추가 속성 거부·POST/HTTPS/고정 origin/path/trusted ingress·현 소유권 reader를 확인한 뒤 기존 HipassService DPoP verifier와 persistent replay 저장소를 호출한다. 별도 `mediq-patient-self-view-gateway` audience, PATIENT_SELF_VIEW authority, VIEW_ONLY, 서버 source/Gateway/scope, cnf.jkt, 최대300초 및 인증 expiry 이하로 내림한 TTL, 감사 세션과 token hash ledger에 결속한다. 서명한 raw token은 RAM에서만 보관하고 기존 atomic persistence COMMIT 뒤에만 반환한다. body/proof/key/store 장애·timeout·기한 경과에는 토큰 미반환. 이 내부 클래스는 HTTP route를 mount하거나 Viewer 권한을 활성화하지 않으며 default-off다. HS256 서명은 기존 development KeyProvider 기반으로, 실제 Azure Key Vault 영상 암호화/환자 key release 성공 주장과 구분한다.

새 단위5/5 PASS(241.990ms): TTL/signature/hash binding·body/ingress 주입 거부·nonpersistent replay/key/proof 거부·저장실패/기한·지연 proof 후 미발급. 실제 독립 PG에서는 EC proof 서명 검증/nonce SQL claim·signed grant/hash ledger·재사용/누락/위조 거부 감사, replay adapter 재생성 후 재사용 거부 및 저장소 장애503까지 확장9항목 PASS(16.712초). HTTP 인증 middleware·실제 브라우저·Gateway token 소비·key release는 아직 NOT VERIFIED다. 확장 첫 시험의 검증기 DB 재조회 값을 live memory에 덮어쓴 오류 FAIL(24.240초)은 DB 읽기 검증 후 원래 memory를 복원해 해소했으며 제품 정책을 완화하지 않았다.

전체 Node 첫 동시 실행은 개인정보 filter fixture 일부 FAIL이었다. Docker SQL 시험 종료 뒤 같은 전체 명령을 재실행해 **797/797 PASS/exit0/43.486초**를 확인했다. 최초 실패의 기술 원인을 자원 경합으로 확정하지 않는다. 최종 stdout은 `artifacts/workstation/patient-grant-node-regression-20261009.log`. secret scan findings0(2026-10-09T12:01:33.060Z). 신규 증적 DRAFT / UNASSIGNED, 기존 사람 승인을 승계하지 않는다. 다음 작업 한 개는 **신규 발급 서비스를 기존 인증·trusted ingress HTTP 경로에 default-off로 연결해 실제 요청의 정상·거부·응답 secret 비노출 계약을 검증**하는 것이다. 영상/Key Vault/웹 실픽셀 전체 흐름은 계속 미완료다.

아래20:52 이전의 “DPoP 발급 다음” 설명은 당시 이력이며 위 내부 발급 구현이 현재 상태다. 로컬 scoped PASS를 최신 Cloud/B 배포나 전체 MVP/v3 완료로 승격하지 않는다.

최종 enum 중앙화와 현재 소스 기준 실제 SQL 발급 재실행도9항목 PASS/exit0/15.587초, grants3/audits11/proofs1 및 DB 재조회 hash integrity 확인·cleanup=true다. `artifacts/workstation/patient-grant-issuance-20261009.json`에 범위·실패 이력·핵심 소스 hash·회귀 결과를 보존한다. Secret scan findings0(2026-10-09T12:03:41.298Z). 현재 Cloud/A/B image나 DB schema는 교체하지 않았다. 이전 `patient-self-view-postgres-20261009.json`은 발급 전6항목의 당시 소스 hash 이력으로, 지금의 변경된 verifier source와 같은 hash라고 주장하지 않는다.

**실제 격리 PostgreSQL 통합 검증 완료(신규 DRAFT / UNASSIGNED)**: `node scripts/verify-patient-self-view-postgres.js`, exit0/PASS/21.156초. 현행 legacy schema의 필요한5개 테이블과033~035를 원문에서 적용한 별도 pinned postgres:16-alpine 컨테이너(tmpfs)에서 실제 nonowner/비superuser 역할로 실행했다. 정상 Grant+기존 감사 커밋, 감사 SQL 실제 실패 시 Grant/감사 모두 rollback, ownership version 변경 거부, 기존 service.writeAudit/save와 동시 처리 후 DB에서 다시 읽은3건의 기존 hash 내용·chain 검증, 타 Series/DOCTOR 거부 후 grants2/audits3 불변, 감사 UPDATE 권한 부재까지6항목 PASS다. 이는 논리적 SQL 트랜잭션 시험이며 디스크 crash 내구성·실제 인증/DPoP·발급 API·클라우드 DB/배포 증거가 아니다. role의 row-lock용 제한 column privilege는 임시 합성 시험 전용이며 production role 승인으로 승계하지 않는다.

첫 실행의 단계 정보 부족 FAIL과 후속 schema/readiness FAIL은 보존한다. 단계 진단·유한 timeout 및 tmpfs 격리를 보강한 뒤 grant-and-audit에서42501 권한 오류를 실제 재현했다. 테이블 lock에는 SELECT/INSERT만으로 부족하므로 **감사 UPDATE 권한을 추가하지 않고**, public.audit_logs의 fixed lock만 수행하는 migration035 SECURITY DEFINER 함수·고정 pg_catalog search_path·PUBLIC 실행 REVOKE·별도 writer EXECUTE를 적용해 해소했다. 정상 이전15.712초 PASS는4항목, 최종21.156초 PASS는6항목으로 구분한다. 모든 실행에서 그 실행이 생성한 컨테이너만 종료했고 최종cleanup=true; 기존 DB/PACS/Cloud/A/B·volume에 migration/등록/배포하지 않았다.

다음 작업 한 개는 **기존 persistent DPoP issuance verifier와 별도 patient audience/TTL signer를 연결하여 Grant 발급 정상·거부를 끝내는 것**이다. 영상/Key Vault/웹 실픽셀 전체 흐름은 아직 미완료다. 기존 의료진 token/동의 경로를 우회하지 않는다.

최종 전체 Node792/792 PASS/exit0/41.556초, secret scan findings0(2026-10-09T11:53:48.157Z), 문법/diff check exit0. 실제 SQL 시험의 결과·이전 실패·3개 핵심 소스 SHA-256은 `artifacts/workstation/patient-self-view-postgres-20261009.json`에 보존했다. 이 artifact는 로컬 생성 증적이며 독립 사람 검토 승인이 아니다.

아래20:42/20:37의 구현 설명과 당시 NOT VERIFIED 상태는 **이전 하위 작업 이력**이다. 위6항목 SQL 시험은 해당 격리 통합 미검증만 해소하며, 실제 발급/DPoP/운영 배포·전체 MVP 상태를 승격하지 않는다.

후속 구현: `patient-self-view-audit-adapter.js`가 기존 감사 builder/hash 형식·PostgresStore saveQueue를 재사용한다. 기존 `writeAudit`의 메모리 append도 같은 큐에서 직렬화한다(이상행위 후속 처리는 큐 밖에서 기존 방식 유지). adapter는 이전 변경을 flush하고 Grant 트랜잭션 안에서 audit_logs 쓰기 lock·DB chain head와 메모리 head 비교·bound audit INSERT를 수행한다. 확인된 COMMIT 뒤에만 메모리/committed baseline에 새 감사를 넣는다. commit outcome unknown에는 저장 큐를 fail closed해 재시작/reload 전 stale full save를 금지한다. default-off·명시적 singleWriter 조건이며 API HA 구현이 아니다. 실제 DB repository/adapter 통합·runtime 연결·DPoP 발급·배포는 아직 NOT VERIFIED/미완료다. mocks의 원자성 결과를 실제 DB 증거로 승계하지 않는다.

adapter 선택4/4 PASS(235.013ms), 저장/adapter 선택18/18 PASS(최종 commit-unknown 방어 포함,888.484ms). 최종 전체 `node --test` **791/791 PASS/exit0/42.255초**, 마지막 commit-unknown 방어를 포함한 현 코드 기준이다. JS 문법/diff check exit0, Secret scan findings0(2026-10-09T11:42:22.792Z). 라이브 E2E/staging smoke·Cloud/VM 배포는 이번 실행에 포함되지 않는다. 변경 영향 FR-021~025/037~041이며 기존 감사 기록의 hash를 재서명하지 않았다. 다음 작업은 **실제 격리 PostgreSQL에서 Grant+감사 원자성·기존 save 동시성 확인 후 DPoP 발급 연결**이다.

`src/patient-self-view-grant-repository.js`와 migration034를 추가했다. default-off 내부 저장 기능이며 발급 API/서명/DPoP verifier/영상 권한이 아니다. 같은 DB 트랜잭션에서 live authority row lock·ownership revision 확인·token hash ledger INSERT·주입된 감사 writer·영수증/만료 검사·COMMIT 순서를 강제한다. 기존 global 감사 chain에 연결하는 실제 writer는 아직 없다. 테스트 writer가 제공한 영수증을 실제 PostgreSQL 감사 성공으로 보고하지 않는다. 실패·expiry·timeout에서는 성공 영수증과 raw token이 반환되지 않는다.

033은 legacy snapshot 테이블을 향한 외래키를 제거해 기존 full save의 TRUNCATE CASCADE가 신규 authority를 삭제하지 않도록 보완했다. missing/remapped legacy 행은 reader의 live JOIN에서 계속 거부한다. 로컬 `hipass-postgres`에 격리 schema를 만든 트랜잭션에서 033+034 DDL, 합성 ledger INSERT, TTL/DPoP check와 legacy TRUNCATE 후 ledger 보존을 실행하고 **전부 ROLLBACK/exit0**했다. 기존 실행 DB/PACS 데이터·volume·Cloud/A/B 배포는 변경하지 않았다. reader/repository의 실제 DB·감사 통합과 Cloud migration은 NOT VERIFIED.

관련 FR-006~013/021~025/037~041. 최종 선택16/16 PASS/exit0/246.482ms(소켓 오류 추가 포함), JS 문법·secret scan findings0·diff check exit0. 전체 `node --test`786/786 PASS/exit0/42.296초는 마지막 소켓 테스트 추가 전에 시작한 실행이며, 추가 테스트는 최종 선택 실행에서 PASS했다. 라이브 E2E와 staging smoke는 node 전체 실행에 포함되지 않으며 이 작업에서 재실행하지 않았다. 다음에는 기존 감사 head 직렬화·원자성 adapter를 연결해 실제 DB 실패·중첩 legacy save·DPoP 발급 정상/거부를 확인한다. 이 하위 작업의 PASS는 지정 사용자 흐름 종단 완료나 전체 MVP/v3 완료가 아니다.

### 환자 본인 열람 — S1 채택 후 구현 진행

사용자의 “권고안 실행”으로 S1의 별도 환자 authority/ledger/audience·명시적인 합성 계정/ref·실제 Key Vault 경로를 채택했다. 이전 승인 대기 상태는 해소됐으며 신규 독립 검토나 전체 기능 완료를 뜻하지 않는다. 이 채택을 S1 계약/구현계획에 기록했다.

첫 차단 지점인 trusted authority read를 로컬 구현: `src/patient-self-view-authority.js`는 기본 비활성, 서명 검증된 capstone TEST principal의 정확한 subject/profile·issuer/audience·session expiry와 DB의 명시적인 계정/ref 상태·현 소유 Study/Series·원본 기관을 바인딩된 단일 bounded query로 읽는다. 조회 전후 세션 만료를 확인하고 계정/ref UUID/version 변경을 scope revision에 결속한다. legacy 행 존재만으로 ACTIVE를 만들거나 browser body의 ownership/status를 채택하지 않는다. `src/auth.js`의 내부 principal에 서명 검증된 issuer/audience/exp를 유지하도록 보강했다.

`db/migrations/033_capstone_patient_self_view_authority.sql`은 계정/ref 두 projection의 명시적 status/revision·FK·PUBLIC 접근 차단만 정의한다. 자동 seed/기본ACTIVE/runtime write 권한은 없다. 실제 로컬 PostgreSQL의 격리 schema transaction에서 DDL 실행 후 전부 ROLLBACK한 probe exit0/PASS; Cloud migration·등록·reader DB 종단 성공 증거는 아니다. 원본 DB/PACS volume·실행 이미지를 교체하지 않았다.

`test/patient-self-view-authority.test.js` 및 기존policy 선택9/9 PASS(135.576ms), 전체Node780/780 PASS/exit0(42.237초), secret scan findings0·문법/diff check PASS. 최종 inherited-property 방어는 같은 정상 profile 선택 조건에 명시적인 own-property 확인만 추가했다. 관련 FR-006~013/021~025/037~041. 기능 완료가 아니라 실제 본인 CT 흐름의 첫 하위 작업이다. 신규 증적 DRAFT / UNASSIGNED.

다음 실행 작업은 같은 CT 본인 열람 흐름의 **명시적 합성 계정/ref 등록과 durable grant ledger·DPoP 발급을 기존 감사 원자성에 연결**하는 것이다. 그 뒤 A/B patient data plane·Key Vault release·실제 픽셀·정상/음성·후보 배포까지 끝내야 한다. 현재 발급 API·영상/키 권한은 활성화하지 않았으며 의료진 token/가짜 consent로 우회하지 않는다. 아래20:19 승인 대기 설명은 당시 이력이다.

### S1 채택 전 점검 이력 — 20:19 KST

20:19 KST 안전한 독립 점검: `node scripts/operations-expiry-check.js` exit0/PASS, `node scripts/cert-fixture-check.js` exit0/PASS. 로컬 runtime4개 유효·잔여58일, bad fixture는 실제 expired/예상 expired 일치. 여기서 출력한 vulnerability exception image8ebb9d63은 기존 로컬 정책 범위이며 실제 Cloud a5487906 취약점 승인으로 승계하지 않는다. 별도10초 bounded strict TLS `GET https://192.168.111.149:9443/api/health`에서 HTTP200/status UP/database UP 확인(exit0). B 실제 peer는 CN=highpass-hospital-b-portal-development-only, issuer=hipass-dev-root-ca, 유효2026-10-08T16:06:42Z~2026-11-08T16:06:42Z(종료2026-11-09 01:06:42 KST), SHA25694:3B:64:83:3B:7B:D4:AE:9A:31:90:98:97:DD:59:48:B1:86:9C:3B:1E:6E:EC:A5:5C:CB:01:89:6B:76:91:3F다. 로컬 localhost 인증서와 실제 B peer 만료일을 구분한다. 이는 전체 A/Cloud peer certificate inventory나 mTLS 음성/패킷 경계 검증이 아니다.

기존 `workstation-automatic-ops.py verify-a-existing/boundary-check`는 VM password를 숨겨진 stdin으로 받아야 한다. 이 분석에서는 credential을 argv/파일/로그에 넣거나 자동 생성·신뢰 완화하지 않았고, 해당 새 VM 검증은 NOT VERIFIED다. S1 계약 채택 확인은 계속 필요하며, 자동 continuation이나 이전 사람 승인을 신규 계약 승인으로 해석하지 않는다. 독립적으로 가능한 Security Gate·로컬 인증서/fixture·공개 health 점검은 종료했다. 다음 본인 실영상 구현은 사용자 계약 선택 전 착수하지 않는다.

S1 계약 채택 여부는 사용자에게 확인 요청했고 아직 답변이 없다. 자동 goal continuation은 신규 계약 승인으로 해석하지 않았다. 대기 중 안전한 기존 회귀로 `$env:HIPASS_SECURITY_GATE_TIMEOUT_MS='120000'; node scripts/security-gate.js`를 실행했고20:17 KST exit0/PASS다. 실제 stdout을 보존한 `artifacts/security/security-gate-20261009T111726Z.json`: unit-tests42.680초, secret-scan1.236초, dependency-audit1.527초 모두exit0. pnpm 실행11.7.0/project pin11.7.0/lock9.0 일치; global manifest11.22.0 차이 경고는 유지한다. 서명/TLS 검증을 완화하거나 lockfile을 재생성하지 않았다. 의존성 audit은 기존 `--prod --audit-level critical` 범위이며 모든 HIGH 취약점 부재나 실제 운영 승인 증거가 아니다. artifact는 DRAFT / UNASSIGNED이며 사람이 검토한 것으로 표시하지 않는다. 이 게이트는 본인 영상 Grant 미구현을 해소하지 않는다.

기존 `docs/api/MEDI-Q-PATIENT-SELF-VIEW-GRANT-CONTRACT.md`는 S1 DESIGN CONTRACT / NOT IMPLEMENTED / DRAFT / UNASSIGNED다. 현재 `recordPatientSelfView`는 최소 study 메타데이터·감사만 반환하며 웹/모바일은 명시적인 모의 canvas 한 프레임을 표시한다. 순수 `evaluatePatientSelfViewPolicy`는 기초 판단만 있고 trusted authority reader·grant ledger·DPoP 발급·A/B patient data plane·환자 key release·실제 UI 픽셀 연결은 없다. 문서와 코드 대조로 확인한 첫 차단 지점은 승인되지 않은 authority 계약이며, 의료진 토큰 주입이나 가짜 동의로 우회하지 않는다.

권고 선택은 S1의 별도 PATIENT_SELF_VIEW authority/audience·별도 ledger·원본 A 유지·환자 전용 제한 경로·실제 Key Vault 결속을 채택하고, legacy patient 행의 존재를 ACTIVE로 간주하지 않는 명시적 capstone Mock IdP account/ref evidence adapter를 구현하는 것이다. 실제 IdP 완료 주장은 하지 않는다. 신규 구현·DB migration·ingress 활성화·클라우드 자원 변경은 이 분석에서 수행하지 않았다. 사용자의 계약 선택 확인 후 같은 CT 본인 열람 흐름의 하위 작업으로 reader→durable grant→영상/키→화면→타인/범위/만료 거부와 배포까지 이어간다. 이전 검토자 승인은 이 새 계약에 승계하지 않는다. CT/MRI 의료진 흐름 PASS는 유지하며 환자 본인 열람은 NOT VERIFIED/미완료다.

### 앞선 CT 결과 — 정상·거부·초기 인증 감사 검증 완료

- 두 파일만 교체한 `Dockerfile.auth-denial-control`로 기존4315941d Cloud runtime을 기반으로 후보를 생성했다. 서버·auth 이외의 dependency/schema/UI는 교체하지 않았다. `artifacts/security/container-scan/capstone-auth-denial-20261009.json`의 정확한 후보 a5487906 HIGH0/CRITICAL0 및 Container Gate PASS/exit0. 배포 guard Python7/7 PASS.
- Cloud-only 배포·이전4315941d rollback·후보 재적용·readiness PASS/exit0: `artifacts/workstation/cloud-app-rollout-2026-10-09T11-03-10.202598+00-00/result.json`. PostgreSQL 컨테이너와 이전 감사6119건 fingerprint가 전후 동일하다. Compose 기존 설정·Key Vault·A/B·DB migration·PACS volume을 변경하지 않았다.
- 동일 모바일 동의·Ticket→실제 의료진 접수 버튼→CT12 SOP/256×256/다음 슬라이스→철회·픽셀 제거 PASS/exit0: `artifacts/workstation/b-browser-2026-10-09T11-07-48.387937+00-00/result.json`, 92.322초. 새 verifier의 **9개 음성 조건 모두403/denialAudit PASS**: Series, 다른 기관, 환자 역할, 의료진 ID 위조, consentId 누락, 존재하지 않는 동의, 서명 변조, DPoP 누락/재사용. 같은 동의의 별도 bound API probe이며 정상 의료진 브라우저 단계를 대체하지 않는다.
- 각 음성 요청 직렬 창에서 tokens109/releases274/consumed187 및 consent/scope SHA-256 불변, 성공 audit1702 불변(의도된 DPoP 최초 정상 QIDO 이후 재사용 기준1703 불변), 영상/token/key-envelope 반환 없음. 물리적인 PACS 요청·패킷 부재나 모든 DB 테이블 불변을 증명한 것은 아니다.
- 같은 실행 PG 감사: `artifacts/workstation/phantom-audit-2026-10-09T11-07-55.652273+00-00/result.json`, exit0. **이번 consent와 실제 인증 actor/hospital에 연결된** 기관·역할·의료진 ID 거부 각1, probe session의 Series·DPoP 및 기존Study/다운로드/철회 거부 확인. UI token의 Vault 발급4/소비4·wrap/precheck/consume 연결·전체 hash chain6218 PASS. 변조/입력 누락/존재하지 않는 동의의 사유는 직렬 창 감사 증가로 확인하며 이 정확한 session 조회 범위와 구분한다. Azure provider 서비스 로그 조회가 아니다.
- 새 조합의 B HTTPS 자산11/11 hash PASS: `presentation-ui-inventory-1791543983443/result.json`. 최종 Node775/775 PASS/exit0/43.332초, 선택10/10 및 Python guard7/7 PASS. secret scan findings0, JS 문법/diff check PASS. 모든 시작 명령은 종료했고 생성 consent/브라우저 cleanup PASS. 신규 증적 DRAFT / UNASSIGNED, 신규 사람 승인 아님.

이번 완료 선언은 **지정한 CT 사용자 흐름 — 정상·거부 종단 검증 완료**로 한정한다. 초기 인증 거부 감사 FAIL은 이 새 실행으로 해당 endpoint/세 조건에서 해소됐으며 아래 과거 FAIL/미배포 설명은 당시 이력이다. Cloud 감사 저장 장애의 실제 주입은 수행하지 않았고 로컬 HTTP fixture로만503을 시험했다. 다른 endpoint의 초기 인증 거부 전체를 검증하거나 고쳤다고 주장하지 않는다.

실행 명령과 결과: `docker build --network=none --pull=false -f Dockerfile.auth-denial-control --build-arg CAPSTONE_BASE_IMAGE=highpass-platform-mvp:capstone-phantom-control-fix-20261009 -t highpass-platform-mvp:capstone-auth-denial-20261009 .` exit0 → 기존 container-scan/Container Gate(정확한 새 scan 경로) exit0 → `capstone-cloud-app-rollout.py --image highpass-platform-mvp:capstone-auth-denial-20261009 --image-id sha256:a54879068331c235fbd9636b899717fd06b5682ccf07ea9605a0a87ee1178783 --expected-current-id sha256:4315941d000e93ffb7adda63f423b0c336662cff761d9aa7b0219db56ef0f6fa --scan artifacts/security/container-scan/capstone-auth-denial-20261009.json --verify-rollback` exit0 → 기존9228 VerticalFlow wrapper exit0 → `capstone-phantom-audit-check.py <11-07-48 browser receipt>` exit0. 복구는 기존 operator가 보존한 Compose context·이전 image로 실행하며, 이번에 실제 rollback 후 readiness를 확인하고 후보를 재적용했다. 기존 data/volume 삭제는 없다.

20:09 당시 다음 작업은 동일 최신 Cloud/B 조합의 MRI 흐름이었다. 위20:15 결과에서 별도 새 MRI consent/Ticket의 실제 브라우저·PG 검증을 완료했다. 카메라/네이티브 생체인증/환자 본인 실제 픽셀, 영상 token 실시간 만료, 패킷 수준 경계, 최종 재시작, 전체 security gate, 독립 사람 검토 및 전체 v3는 NOT VERIFIED/미완료다.

### 초기 인증 거부 감사 로컬 구현 이력 — 20:00 KST

`src/auth.js`에 기존 doctor assertion을 그대로 호출하는 `assertDoctorPrincipalAudited`를 추가하고 `src/server.js`의 POST `/api/dicom-access/request` 초기 assertion만 연결했다. 기관·역할·의료진 ID 거부는 TOKEN_DENIED/FAIL/원래 reasonCode로 기존 writeAudit → store.save에 영속화한 뒤 원래403을 반환한다. authenticated principal의 actor/hospital과 형식 검증한 attempted consent reference만 기록하고 본문·token·proof·사용자 위조 ID는 복사하지 않는다. 감사 저장 실패는 안전한503 AUTHORIZATION_AUDIT_UNAVAILABLE이며 토큰 발급으로 진행하지 않는다. 다른 API의 초기 AuthError 처리를 전역 교체한 작업은 아니다.

`test/doctor-assertion-audit.test.js`: helper 정상·3가지 거부·저장 실패·입력 최소화 및 실제 격리 HTTP에서 3건 영속 hash/session/사유·발급/동의 불변, 생성 fixture 파일의 쓰기 실패503을 확인했다. 선택5/5 PASS(6.598초), 전체 Node775/775 PASS(42.001초), exit0. 최초 격리 HTTP 시험은 3초 요청 timeout으로 기존 반복 거부 tarpit을 기다리지 못해 FAIL이었다. 보안 지연을 끄지 않고 요청10초/시험30초 유한 기한으로 재검증했다. 기존 임시 fixture와 테스트 소유 서버는 정리했다.

기존 mobile browser verifier는 다음 실행부터 각 음성 조건의 감사 증가를 필수로 요구하며 `denialAudit`를 별도 출력한다. 아래 과거 receipt는 변경하지 않았다. 기존 배포에서 차단만 성공해도 감사 증가0이면 새 verifier 전체는 FAIL이어야 한다. 문법·secret scan findings0·diff check PASS. 변경 관련 FR-014~025/037~041 및 V3-SR-AUD-001/003, V3-SR-API-003. DB schema·정상 토큰 계약·TLS·TTL은 변경하지 않았다. 신규 로컬 결과는 DRAFT / UNASSIGNED이며 Cloud/B/A에는 아직 이 변경을 배포하지 않았다.

다음 작업 한 개: **현재 Cloud image/source baseline 재확인 → server/auth 두 파일만 담은 후보 이미지 검사 → 기존 이미지로 rollback 가능한 Cloud-only 배포 → 동일 브라우저9건·PG 감사 연결 재검증**. 아래 최신 live 인증 거부 감사 FAIL은 로컬 시험 PASS로 승계하거나 해결 완료로 표시하지 않는다.

### 앞선 추가 음성 검증 — 차단 PASS / 초기 인증 거부 감사 FAIL

동일 B 배포에서 모바일 동의·Ticket → 실제 의료진 버튼 → CT12/256×256/다음 슬라이스 → 철회·픽셀 제거를 다시 실행했다. 신규 증적은 DRAFT / UNASSIGNED이며 전체 MVP/v3 완료가 아니다. 이번에는 제품 서버·API·DB schema·배포를 변경하지 않고 기존 검증기 3개만 보강했다.

- 실제 브라우저: `artifacts/workstation/b-browser-2026-10-09T10-53-05.967153+00-00/result.json`, wrapper exit0, 196.982초. 음성 요청은 같은 동의의 별도 검증기 키에 결속된 토큰/API로 실행했으며 정상 화면 경로를 API로 대체하지 않았다.
- PG 연결: `artifacts/workstation/phantom-audit-2026-10-09T10-53-19.637926+00-00/result.json`, exit0. 같은 probe auditSessionId의 Series·DPoP 누락·재사용·기존 Study/다운로드/철회 거부 사유 확인, 실제 UI 토큰 Vault 발급4/소비4 및 wrap/precheck/consume 연결, hash chain6119 PASS. 토큰 변조는 직렬 요청 창의 TOKEN_INVALID 감사 증가로 확인했으며 이 PG 연결기의 정확한 probe-session 목록에는 포함되지 않는다.
- HTTPS 정적 자산11/11 동일 해시: `presentation-ui-inventory-1791542864992/result.json`, exit0. 전체 Node770/770 PASS, exit0, 42.237초; 선택 회귀5/5 PASS, exit0. JS 문법·diff check·secret scan findings0 PASS. Node 결과는 별도 live 보안 게이트를 대체하지 않는다.

| 음성 조건 | HTTP / 안전한 공개 사유 | 정책 사유 | 차단·측정한 부작용 부재 | 거부 감사 |
|---|---|---|---|---|
| 다른 Series | 403 / ACCESS_DENIED | TOKEN_SERIES_MISMATCH | PASS | PASS, 동일 probe session |
| 다른 기관 | 403 / HOSPITAL_IDENTITY_MISMATCH | 동일 | PASS | FAIL, 증가0 |
| 환자 역할로 의료진 토큰 발급 | 403 / ROLE_NOT_ALLOWED | 동일 | PASS | FAIL, 증가0 |
| 의료진 ID 위조 | 403 / DOCTOR_IDENTITY_MISMATCH | 동일 | PASS | FAIL, 증가0 |
| consentId 입력 누락 | 403 / INVALID_REQUEST | 동일 | PASS | 요청 창 증가2 |
| 존재하지 않는 동의 | 403 / ACCESS_DENIED_NO_CONSENT | 동일 | PASS | 요청 창 증가2 |
| 토큰 서명 변조 | 403 / ACCESS_DENIED | TOKEN_INVALID | PASS | 요청 창 증가1 |
| DPoP 누락 | 403 / ACCESS_DENIED | DPOP_PROOF_REQUIRED | PASS | PASS, 동일 probe session |
| 동일 DPoP 재사용 | 403 / ACCESS_DENIED | DPOP_NONCE_REPLAYED | PASS | PASS, 동일 probe session |

각 요청 전후 읽기 전용 REPEATABLE READ snapshot을 비교했다. 전역 token 발급107 / key release270 / 소비183은 9개 요청 모두 불변; 관련 성공 audit1675도 불변이었다. 재사용 검증의 최초 정상 QIDO200은 의도된 성공이므로 그 후 새 기준1676에서 재사용의 성공 증가0을 비교했다. 동의·scope row SHA-256도 동일하고 JSON 거부 응답에 영상·토큰·키 envelope·ciphertext가 없었다. 이 관측은 직렬 시험 창의 DB 상태·응답 비교이며 PACS 요청/패킷의 물리적 부재나 모든 가능한 DB 테이블의 불변 증거는 아니다. 전역 감사 증가는 동시 트래픽에 영향을 받을 수 있으며 정확한 session 연결 결과와 구분한다. raw token/개인키/동의 row 내용은 증적에 출력하지 않았다.

초기 인증 거부 3건은 `src/server.js`의 AuthError 처리에서 안전한 403 응답만 반환하고 감사 저장을 하지 않는 경로와 일치한다. 따라서 browser receipt의 PASS는 화면 흐름·차단·측정 부작용 범위이며 **전체 거부 감사 PASS가 아니다**. 관련 FR-014~025/026~036/037~041, V3-SR-AUTH-002/004, V3-SR-AUD-001/003, V3-SR-API-003의 전체 충족으로 승격하지 않는다.

최초 실행 `b-browser-2026-10-09T10-48-52.230883+00-00/result.json` exit1/51.525초는 입력 누락에 ACCESS_DENIED_NO_CONSENT를 기대한 검증기 계약 오류로 FAIL이었다. 실제 응답 INVALID_REQUEST를 보존하고, 입력 누락과 존재하지 않는 동의를 분리한 새 실행으로 검증했다. 기존 FAIL 증적을 수정하거나 제품의 허용 우회로 단정하지 않았다. 생성 동의의 정확한 철회 cleanup 및 wrapper 소유 브라우저 종료 PASS; 이번 실행 명령은 모두 종료했다.

재현: `powershell -NoProfile -File scripts/run-browser-authorization-trace.ps1 -Port 9228 -Capstone -MobileQr -VerticalFlow -BrowserUrl https://192.168.111.149:9443/hipass/`, 이어 기존 Azure CLI Python으로 `scripts/capstone-phantom-audit-check.py <위 browser receipt>` 실행. 기존 presenter 인증을 안전하게 읽으며 원본 PACS/volume을 삭제하지 않는다. 유한 요청·snapshot35초·전역300초/부모315초 제한을 유지한다.

### 앞선 사용자 흐름과 범위별 검증 이력

`HP-TEST-PHANTOM-001` → 모바일 PHANTOM 개발 로그인·PIN 모의 인증 → CT 한 Study/VIEW_ONLY/HOSP-B/1h 동의 검토 → 일회용 Ticket → 실제 의료진 웹 로그인·동일 Ticket 수신·QR 인식 시뮬레이션 버튼 → A DICOM/암호화 Viewer → 다음 슬라이스 → 모바일 명시적 철회 → 서버 거부·의료진 픽셀 제거.

- 최신 브라우저 증적: `b-browser-2026-10-09T10-25-47.000555+00-00/result.json`, exit0. 정확한 CT SOP12/256×256/다음 슬라이스, 같은 동의·Ticket·UI 토큰 연결과 실제 모바일 철회·의료진 픽셀 제거 확인. USED 재사용 거부도 확인. 다른 Study·DOWNLOAD·철회 후 rendered 음성 요청은 같은 동의의 **별도 검증기 키에 결속된 API 토큰**을 사용하며 UI 접수를 대체하지 않는다. 정상 QIDO control200 후 generic ACCESS_DENIED403을 확인하고 원인은 PG 감사로 확인한다. 카메라 스캔/네이티브 생체인증/환자 본인 실제 픽셀/MRI 종단/전체 v3는 NOT VERIFIED.
- 동일 실행 PG 증적: `phantom-audit-2026-10-09T10-26-16.821006+00-00/result.json`, exit0. 음성 probe의 정확한 auditSessionId에서 TOKEN_STUDY_MISMATCH/TOKEN_PERMISSION_MISMATCH/TOKEN_CONSENT_INACTIVE 각1 확인. UI token의 Key Vault binding5/소비5 및 각 소비 wrap/precheck/consume PASS, 전체 hash chain5936 PASS. Azure Key Vault provider 서비스 로그를 검증한 것은 아니다.
- 이전 `10-14-21`의 scope/철회403은 다른 DPoP 키를 사용해 정책 원인 증거로 불충분했다. 강화한 `10-23-14` 실행은 안전한 generic403에 내부 reason을 요구해 FAIL이었다. 실패·부분 성공 기록은 보존하고 위 최신 실제 실행+PG 증거로 판정한다.
- 이번 최종 코드 기준 전체 Node: 770/770 PASS, exit0, 42.208초. 별도 HTTPS/staging/모든 live 보안 게이트를 포함한 결과가 아니다. 선택 회귀16/16 PASS 및 secret scan findings0/exit0.
- 추가 mTLS: `automatic-2026-10-09T10-17-10.055970+00-00/result.json`의 정상 ALLOW, 무인증·wrong issuer/SAN/EKU·expired/bad DENY 모두 PASS. 그러나 결합 verify-a는 QIDO expected3/actual5 때문에 FAIL/exit1이다. 기존 시험이 합성 기본 영상4개를 재적재했으며 순수 read-only 시험은 아니다. 이 FAIL을 전체 PASS로 덮지 않는다.
- 보완 재검증 `automatic-2026-10-09T10-20-48.232212+00-00/result.json`: 기존 runner의 `verify-a-existing` 모드는 seed를 실행하지 않고 명시적인 기존 CT/MR UID2개+원래3개를 정확히 비교한다. 7개 mTLS 경로·QIDO5·임시 검증 인증서 정리 모두 PASS/exit0. 일반 verify-a의 원래3개 기대 조건은 유지한다.
- 네트워크 inventory 및 B→A raw Orthanc 접속 거부: `automatic-2026-10-09T10-17-51.099571+00-00/result.json`, exit0. 비노출 binding과 ECONNREFUSED 범위이며 패킷 수준 경계 검증을 대신하지 않는다.
- 최초 직접 runner는 CDP 미기동으로 실패했다(`10-10-59` 기록). 기존 wrapper로 독립 headless Chrome을 시작한 후 실행했다. 정책 DENY나 제품 결함 증거가 아니다.

### 남은 사항과 다음 작업 한 개

QR 실제 만료 재검증: `b-browser-2026-10-09T10-27-58.933011+00-00/result.json`, wrapper exit0. 클라이언트 QR 제거→본인/의료진 검증 identity 재로그인→동일 consent/Ticket/expiresAt 서버 EXPIRED→fresh DPoP redemption DENIED/TICKET_EXPIRED/no accessToken→정확한 동의 정리 PASS. 실제 대기615.439초, 서버 상태 읽기 관찰5.097초, 최종 HTTP Date도 기한 이후였다. 앱 session·TTL·시계를 조작하지 않았다. 만료 시험은 별도 새 동의이며 같은 CT Viewer 실행에서 토큰 만료를 기다린 증거가 아니다. 기존 `09-40`, `09-53` FAIL을 보존한다. 단일 즉시 조회로 만료를 결론내리던 검증기를 보완했으며 실제 시계 차이의 근본 원인을 확정하지 않는다.

앞선 19:54 기준 다음 작업은 초기 기관·역할·의료진 ID 거부 감사 보완이었다. 위20:09 최신 결과에서 해당 수정·Cloud-only 배포·rollback·동일 CT 브라우저 및 PG 감사 검증을 완료했다. QR 실시간 만료 PASS를 영상 토큰 만료 PASS로 승계하지 않는다. 환자 본인 실영상·MRI 동일 흐름·패킷 수준 경계·최종 재시작·전체 security gate 및 독립 검토는 이번 작업으로 완료 처리하지 않는다.

19:28 당시 변경은 기존 browser runner 연결/검증 보강, 기존 데이터용 mTLS/QIDO 검사, 상태 문서 정리였으며 당시 제품 API/DB/권한/TTL/TLS 또는 배포 변경·commit·push는 하지 않았다. 이후 감사 수정·Cloud 배포는 위20:09 결과로 구분한다. 관련 FR 기능군: FR-001~005,006~009,010~013,014~020,021~025,026~031,032~036,037~041; 관련 보안 요구 V3-SR-AUTH-002/004, V3-SR-CRY-001~003, V3-SR-AUD-001/003, V3-SR-API-003 및 Acceptance V3-AT-ACC-001~004/007. 이 요구 전체의 완료가 아니라 기술시험의 해당 부분에만 대응한다. v3 Grant/다중 Study/STOW/Provenance 완료가 아니다.

### 이번 실행 명령·종료 코드

| 명령 | exit | 범위 |
|---|---|---|
| `node scripts/presentation-ui-live-check.js` | 0 | B 정적 자산11 해시/TLS |
| `capstone-mobile-b-rollout.py --trusted-baseline <기존 pin> --presentation-ui` (apply 없음) | 0 | B 실제 image/health/암호화 모드 |
| `capstone-b-login-check.py` | 0 | 실제 인증 정상/위조 및 PG hash chain |
| `capstone-phantom-catalog-live-check.py --expected-image-id <4315941d…>` | 0 | Cloud image pin/합성 catalog 멱등 등록, added0 |
| `capstone-phantom-source-ops.py <기존 dataset> --verify-only` | 0 | A 실제 image pin/24개 합성 WADO/hash, 추가·삭제0 |
| `run-browser-authorization-trace.ps1 -Port 9228 -Capstone -MobileQr -VerticalFlow -BrowserUrl https://192.168.111.149:9443/hipass/` | 0 | 실제 모바일→의료진 버튼→CT Viewer→철회 |
| `capstone-phantom-audit-check.py <10-25-47 실제 receipt>` | 0 | 동일 UI token Vault/감사, 별도 probe 거부 원인 |
| `run-browser-authorization-trace.ps1 -Port 9227 -Capstone -MobileQr -MobileQrExpiry -BrowserUrl https://192.168.111.149:9443/hipass/` | 0 | 실제 QR 기한/서버 EXPIRED/사용 거부 |
| `workstation-automatic-ops.py verify-a` | 1 | mTLS7 PASS, 구형 QIDO expected3/actual5 FAIL 보존 |
| `workstation-automatic-ops.py verify-a-existing` | 0 | mTLS7·정확한 QIDO5·정리, 재seed 없음 |
| `workstation-automatic-ops.py boundary-check` | 0 | network inventory/raw Orthanc 비노출 범위 |
| `node --test --test-concurrency=4` | 0 | 최종770,42.208초; live scripts 별도 |
| 선택 Node 회귀 | 0 |16개 |
| `node scripts/security-secret-scan.js` | 0 | findings0 |
| 수정 JS `node --check`, `git -c core.safecrlf=false diff --check` | 0 | 문법/공백 |

Python은 기존 `C:/Program Files/Microsoft SDKs/Azure/CLI2/python.exe`를 사용했다. VM 암호는 stdin/메모리만 사용하며 위 표에 기재하지 않는다. 제품 흐름 전 과정의 정확한 wall-clock duration은 이번 runner가 저장하지 않아 미기록이다; QR 대기와 Node 시간을 전체 E2E 시간으로 대신 표시하지 않는다.

## 과거 이력 — 아래 설명은 당시 관측 상태

## 실시간 만료 결과·후속 기초 정책 — 09:40 UTC

최초 실제 만료 실행 `b-browser-2026-10-09T09-40-19.472435+00-00/result.json` FAIL/exit 1: 모바일 EXPIRED·QR 제거 대기 이후 서버 상태 확인 복합 조건 실패. 원인 미확정, 해당 생성 동의 정확한 철회 정리 PASS. 안전한 receipt 진단을 추가한 별도 새 실행이 현재 진행 중이다. 만료 전체 PASS를 선언하지 않는다.

환자 본인 실영상 S1 계약과 순수 기초 policy를 로컬 작성했다. `MEDI-Q-PATIENT-SELF-VIEW-GRANT-CONTRACT.md`, `src/patient-self-view-policy.js`, 선택 테스트 4/4 PASS, 전체 Node 770/770 PASS. 실제 authority reader·ledger·DPoP/token·영상·key release·웹/모바일 연결은 아직 미구현이며 정책 ALLOWED 자체를 영상 허용으로 사용하지 않는다. VM 이미지에는 이 로컬 서버 policy를 배포하지 않았다.

## 최신 현재 B — 모바일 만료 수정 배포 09:30 UTC

현재 image `sha256:940806f602ec282d6d03a9da6948b6a8453bb47ff9f71fdadb8aa40fa5521aea` (capstone-mobile-qr-expiry-20261009). 전체 Node 766/766 PASS, 새 image scan HIGH/CRITICAL 0, 정적 파일 31개 일치 PASS. `mobile-b-rollout-20261009T092728Z/result.json`: B-only 배포·이전 b61b4b84 rollback·재적용·설정 보존 PASS. HTTPS 자산 11/11 일치 (`presentation-ui-inventory-1791538223788/result.json`). A/Cloud/DB 변경 없음.

실시간 QR 만료 모드 실행 중이며 QR 표시·서버 ISSUED 대기를 관측했다. 만료 결과는 아직 NOT VERIFIED다. 상세 `mediq-mobile-qr-browser-2026-10-09.md`. 아래 이전 사용·철회 PASS는 이전 b61b4b84 기준이며 최신 이미지 회귀로 자동 승계하지 않는다. 다음은 같은 실행의 결과 확인·정확한 생성 동의 정리, 이후 환자 본인 실영상 계약 구현이다.

## 모바일 QR 발급·사용·철회 실제 Chrome — 09:21 UTC

현재 B b61b4b84 이미지에서 모바일 팬텀 CT 한 항목 동의/QR 생성, 의료진 실제 인증 API 사용, 모바일 USED polling·QR 제거, 같은 nonce 재사용 차단, 별도 동의의 확인 대화상자 철회·QR 제거·서버 거부 PASS. `b-browser-2026-10-09T09-21-12.032132+00-00/result.json`, 새 생성 두 동의 정확한 정리 PASS. 카메라·의료진 접수 화면·Viewer·실시간 만료 검증은 아니다.

만료 시 QR을 남기는 countdown 경로와 늦은 ISSUED 상태 덮어쓰기를 로컬 수정했다. 현재 B에는 이 만료 수정이 아직 없다. 관련 단위 테스트 6/6 PASS이나 실제 서버 기한 경과 증적을 대신하지 않는다. 상세 `mediq-mobile-qr-browser-2026-10-09.md`. 다음은 만료 수정 회귀·배포와 실제 만료 확인, 이후 환자 본인 실영상 연결이다.

## 최신 현재 B — 환자 표시 정렬 배포·CT 검증 09:14 UTC

현재 B image `sha256:b61b4b84889cd83364a2a837f570eb72a3a795d71ed8705c47c20e9aa479ec62` (capstone-mobile-patient-context-20261009). 후보 파일 31개 일치·새 scan HIGH/CRITICAL 0·Container Gate PASS. `mobile-b-rollout-20261009T091148Z/result.json`: 기존 7cbee1c7 실제 rollback·후보 재적용·원래 환경 보존·HTTPS 11개 PASS. HTTPS 자산 11개 hash 일치 PASS (`presentation-ui-inventory-1791537248442/result.json`). A/Cloud/DB 변경 없음.

새 이미지 CT 브라우저 PASS (`b-browser-2026-10-09T09-14-24.874925+00-00/result.json`): 환자 프로필/Viewer 표시 일치, 정확한 12 SOP/256×256/다음 슬라이스, 인증·DPoP 음성·철회 픽셀 제거. 해당 PG 감사 4/4 release·전체 chain 5414개 PASS (`phantom-audit-2026-10-09T09-14-34.530875+00-00/result.json`). 이전 MRI 3회 결과를 새 배포 MRI 검증으로 승계하지 않는다.

다음은 환자·모바일 화면 시각 확인과 모바일 QR 실제 브라우저 발급·사용·철회·만료 검증이다. 환자 본인 실영상은 별도 소유권·단기 접근 계약 구현이 필요하다. 아래 로컬 미배포 설명은 과거 이력이다. 전체 MVP/v3 미완료.

## 환자 컨텍스트 로컬 정렬 — 후속 작업

고정 환자 표시를 선택 컨텍스트로 정렬하고, 환자 웹·모바일 canvas를 실제 DICOM이 아닌 단일 모의 프레임으로 명시했다. 임의 50장 표시·모의 cine를 제거했으며 의료진 실제 Viewer는 유지한다. 전체 Node 763/763 PASS, exit 0, 42.270초. 선택 회귀 29/29 PASS. 상세: `mediq-patient-context-alignment-2026-10-09.md`.

이 변경은 B VM에 아직 배포하지 않았다. 아래 7cbee1c7 이미지·CT/MRI 6회 성공은 이전 배포 기준으로 유지하며 새 변경의 실제 브라우저 증적으로 승계하지 않는다. 다음은 로컬 화면 검토·후보 이미지 검사·B 배포 후 모바일 실제 QR 흐름 검증과 환자 본인 실영상 연결이다.

## 현재 B 영상 timeout 수정 배포 — 08:47 UTC

- 현재 B 이미지: `sha256:7cbee1c7532733a78e0742d005fda2b17c527dbc895f709e60de96f56075e215`, tag `highpass-platform-mvp:capstone-mobile-viewer-budget-20261009`.
- displaySlice/prefetch의 별도 10초 timer를 제거해 기존 proofFetch의 capstone 영상 35초 제한을 사용한다. token/receipt/package 만료와 서버 정책은 그대로다. 브라우저 팬텀 다음 슬라이스 관찰 기한은 요청 완료를 포함하도록 45초로 설정했다.
- 후보 31개 UI 파일 hash 일치 PASS. 새 Trivy scan HIGH/CRITICAL 0, Container Gate PASS: `artifacts/security/container-scan/capstone-mobile-viewer-budget-20261009.json`.
- `mobile-b-rollout-20261009T084506Z/result.json`: B-only 배포, 기존 a495ae00 이미지 rollback, 후보 재전환, 원래 환경/마운트/포트/보안 설정 보존, HTTPS 경로 11개 PASS. Cloud/A/DB 변경 없음.
- HTTPS 주요 자산 11/11 hash 일치: `presentation-ui-inventory-1791535640041/result.json` PASS.
- 앱 변경 기준 Node 758/758 PASS는 앞선 로컬 결과다. 이번 배포 안전성 Python 7/7 및 timeout/진단 선택 Node 5/5 PASS. 실제 CT/MR 반복 결과는 별도로 확인해야 한다.

### 배포 후 CT 반복·감사 확인

**최종 08:56 UTC:** CT 3/3, MRI 3/3 진단 없는 새 브라우저 반복 PASS. CT 총 200.219초, MRI 총 322.146초. MRI repeat: `browser-repeat-2026-10-09T08-50-53.947225+00-00/result.json`. 전체 Node 760/760 PASS, exit 0, 42.947초.

6개 브라우저 영수증 각각의 읽기 전용 감사 연결 PASS. CT 감사 증적: `phantom-audit-2026-10-09T08-55-24.480058+00-00`, `08-55-26.028237+00-00`, `08-53-40.884698+00-00`; MRI: `08-56-38.230011+00-00`, `08-56-39.778494+00-00`, `08-56-41.287564+00-00`의 result.json. 최종 전체 감사체인 5336개 PASS. 일부 미리 읽기의 미소비 발급은 만료와 명시적 거부를 별도로 확인했으며 성공 소비로 세지 않았다.

다음: 환자/Viewer 고정 P-1001 표시 정렬 → 모바일 실제 QR 발급·사용·철회/만료 화면 검증 → 환자 본인 실영상 연결 계약·구현 → 최종 네트워크/mTLS/재시작/시연 문서·독립 검토. 전체 MVP/v3 완료 판정은 아직 미완료다.

`browser-repeat-2026-10-09T08-47-20.969900+00-00/result.json`: 디버거·자동 재시도 없이 세 새 브라우저 CT 실행 3/3 PASS, 총 200.219초. 각 실행은 정확한 12 SOP/256×256/다음 슬라이스/무인증·DPoP 누락·재사용 거부/철회 후 픽셀 제거/단일 동의·토큰 연결을 확인했다. 2회차 실제 WADO 10.349초, 3회차 최대 18.975초 성공은 기존 10초 중단을 해소한 근거다. 부하·HA 검증은 아니다.

3회차 감사의 최초 `phantom-audit-2026-10-09T08-51-05.480773+00-00/result.json`은 발급 5/소비 4를 모두 소비돼야 한다는 조건으로 FAIL 처리했다. 후속 조회 `08-52-15.124891+00-00`에서 미소비 1건의 만료 및 같은 release_id의 KEY_RELEASE_DENIED를 확인했다. 이력은 보존한다.

검증을 실제 키 발급 계약에 맞춰 소비/거부 결과로 구분했다. 소비된 **각** release의 wrap/precheck/consume 연결을 요구하며, 미소비는 해당 동의 REVOKED·만료·동일 release 명시적 거부가 모두 있어야 확인 완료다. 하나라도 미확인이면 NOT VERIFIED, Vault/소비 감사 불일치는 FAIL이다. DB와 서버 정책 수정 없음. 판정 단위 테스트 2/2 PASS.

`phantom-audit-2026-10-09T08-53-40.884698+00-00/result.json`: CT 감사 4/4 PASS, 5건 중 4건 소비 및 1건 만료·거부, 전체 hash chain 5189개 PASS. allPreparedConsumed=false를 증적에 유지한다. Azure Key Vault 서비스 로그 자체를 확인한 것은 아니다.

## 브라우저 검증 안정화 — 08:26 UTC

아래 08:11 UTC의 새 팬텀 브라우저 미검증 기록 이후 실제 실행 결과다. 이전 실패는 삭제하지 않는다.

- CT 초기 성공 후 강화 검증에서 FAIL했던 기록을 보존한다: `b-browser-2026-10-09T08-16-49.401434+00-00/result.json`. 검증기의 Series/Instance 중복 로딩을 제거하고 자동 토큰 로딩 완료 후 슬라이스를 조작하도록 변경했다. 서버·TLS·DPoP·요청 timeout 변경 없음.
- 수정 후 CT PASS: `b-browser-2026-10-09T08-24-40.417179+00-00/result.json`. 정확한 12 SOP, 256×256 표시, 다음 슬라이스, 무인증 401·DPoP 누락/재사용 403, 철회 후 픽셀 제거, 한 동의/토큰/철회 연결 확인. 이 실행의 감사 참조에는 tokenId가 누락되어 감사 연결 증적으로 사용하지 않는다.
- MRI PASS: `b-browser-2026-10-09T08-26-24.656337+00-00/result.json`. 같은 정상/음성/철회 항목 및 JWT jti 기반 감사 참조 확인.
- MRI 읽기 전용 PostgreSQL 검증 4/4 PASS: `phantom-audit-2026-10-09T08-26-42.766426+00-00/result.json`. 해당 동의 REVOKED, 해당 토큰의 Key Vault-bound release 4개 모두 consumed, wrap/precheck/consume 감사 연결, 전체 저장 감사체인 4519개 무결성 확인. Azure Key Vault 서비스 로그 자체를 조회한 증적은 아니다.
- 전체 Node 754/754 PASS, exit 0, 41.416초. 동의 정리/팬텀 증적 선택 테스트 10/10 및 SSH 출력 제한·stderr 비노출·timeout 테스트 3/3 PASS.
- 실패 정리 도구는 명시적인 고정 팬텀 프로필과 단일 생성 영수증을 요구한다. 과거 실패의 동의를 최신 행 추정으로 철회하지 않았다. 과거 실패 동의 정리는 NOT VERIFIED로 유지한다. 팬텀 실패 정리의 실제 서버 검증은 아직 미실행이다.
- 모바일 QR, 환자 본인 실영상, 사람이 사용하는 화면 흐름·접근성, 복구·최종 독립 검토 및 전체 MVP/v3 완료는 미검증/미완료다.

### 최신 CT 반복 — 08:29 UTC

아래 'rendered 영상 요청이 없어' 설명은 후속 실패 이벤트 조사로 정정한다. 08:29 WADO_RENDERED는 ERR_ABORTED/10007ms이며, 08:38 진단 없는 repeat도 ERR_ABORTED/10003ms다. 두 슬라이스 로더의 명시적 10초 timer가 기존 capstone proofFetch의 35초 영상 제한을 덮어썼다. 로컬 중복 timer 제거 및 선택 회귀 12/12 PASS. B 미배포이므로 실제 반복 안정성 해결은 미검증이다. 상세: `mediq-verifier-stabilization-2026-10-09.md`.

`b-browser-2026-10-09T08-29-08.443530+00-00/result.json`은 FAIL, exit 1이다. 토큰·Study/Series/Instance QIDO는 200이며 정확한 12 SOP를 확인했으나 rendered 영상 요청이 없어 자동 영상 표시 대기에서 실패했다. 중복 검증기 조작 제거만으로 반복 안정성을 해결했다고 주장하지 않는다. 다음 작업은 애플리케이션 displaySlice 진입 전 상태 변경/토큰 정리 경로를 추적해 재현 테스트로 고정하는 것이다. timeout 증가·자동 재시도로 실패를 숨기지 않는다.

이번 실패의 `ownedConsentCleanup`은 PASS: 해당 브라우저 생성 영수증의 동의만 GET 200 → revoke 200 → GET 200, REVOKED 재확인. 레코드 삭제 0. 이 결과는 앞 절의 팬텀 실패 정리 실제 서버 미실행 상태를 대체하지만, 과거 다른 실패 동의 정리를 증명하지 않는다. MRI 감사 PASS와 앞선 CT PASS는 각 실행 범위에만 적용한다.

## 최신 팬텀 연동 배포 — 08:11 UTC

이 절은 아래 최초/이전 실행 기록보다 최신이다. 과거 실패/미배포 설명은 이력으로 보존한다.

- Cloud 수정 이미지 4315941d... 배포/실제 rollback/재승격 PASS, PG/기존 감사 4149개 hash 보존. `artifacts/workstation/cloud-app-rollout-2026-10-09T08-05-02.064365+00-00/result.json`.
- 고정 팬텀 환자/CT·MR Study 2개 카탈로그는 실제 API로 등록 완료. 신규 동의/토큰/v3 Mapping 승인 없음. B HTTPS 등록 검증 8개 PASS: 본인 목록, 무인증·환자·의료진 관리자 작업 거부, 중복 추가 0, 임의 dataset 400. `phantom-catalog-live-1791533289688/result.json`. 과거 500 FAIL 증적 보존.
- 최신 Node 전체 751/751 PASS, exit 0, 44.668초. Cloud/B 후보 모두 정확한 ID 기준 새 스캔 HIGH/CRITICAL 0 및 Container Gate PASS.
- B 현재 이미지 `sha256:a495ae00fa15a12a5001ef46e463f843f94add39e37f0c476d3a85e810420913`, tag highpass-platform-mvp:capstone-mobile-phantom-ui-20261009. 기존 d94f740...에서 웹/모바일 시연 환자 컨텍스트·프로필 선택 반영.
- `artifacts/workstation/mobile-b-rollout-20261009T080850Z/result.json`: B-only 배포 PASS, 이전 이미지 실제 rollback/후보 재승격 PASS. portal와 31개 UI 파일 SHA 확인. 기존 환경/암호화·진단 필수 설정/mount/포트/보안 구성 보존. A/Cloud/DB는 이 B operator에서 변경하지 않음.
- B HTTPS 최신 자산 11/11 hash 일치 PASS, exit 0. 로그인 capstone-auth.js를 실제 비교 목록에 추가했다. `artifacts/workstation/presentation-ui-inventory-1791533466763/result.json`.
- **새 B 이미지에서 브라우저 로그인·256×256 Viewer·12장 이동·QR·철회/감사 종단검증은 아직 NOT VERIFIED**. 아래 이전 2×2 브라우저 PASS를 새 기능에 승계하지 않는다. 정적 자산 배포는 환자 실영상 연결 완료의 증명이 아니다.

다음 착수는 PHANTOM 프로필을 명시적으로 선택하는 실제 브라우저 흐름 검증이다. UI가 새 환자/Study를 일관되게 사용하는지 확인하고 명시적 Series 동의→의료진 단기 토큰/DPoP→실제 Key Vault→B 256×256 Viewer→철회 후 픽셀 제거 및 재접근 차단을 같은 시나리오로 확인한다. CT/MR 각각의 실제 슬라이스/감사 연결이 필요하다.

## 최신 실행 결과 — B 포털 UI 배포 완료

아래 결과는 최초 조사보다 최신이다. 최초 불일치와 실패한 빌드는 그대로 보존한다.

- Docker Engine 직접 조회 PASS: Engine 29.8.0. 최초 PowerShell Job 관측 timeout 원인은 확정하지 않았으며 Engine 미기동/재시작 해결로 보고하지 않는다. 재시작하지 않았다.
- 최초 bare `sha256:<ID>` FROM 빌드 FAIL: BuildKit이 registry 이름으로 해석. 기존 로컬 이미지를 전용 태그로 연결해 정확한 ID를 재확인한 뒤 빌드 PASS.
- 새 이미지: `highpass-platform-mvp:capstone-mobile-presentation-20261009`, ID `sha256:d94f740a1a6109d64bf23265e8dbcbd51d0207291947f8cdc10fb3716264ffcc`.
- 이미지 내부 정적 자산 31개 해시 일치 PASS. Trivy 새 이미지 검사 0 HIGH / 0 CRITICAL 및 Container Gate PASS. 증적 `artifacts/security/container-scan/capstone-presentation-ui-20261009.json`.
- 실제 B baseline 조회 PASS: `sha256:debcfb290bb104c5a6de38955d0c7dbb2708f078a628874be63929dae7d9024a`, healthy, 암호화·진단 필수 설정 활성. 증적 `artifacts/workstation/mobile-b-rollout-20261009T071935Z/result.json`.
- B app-only 적용 PASS: portal source와 정적 자산 32개 확인, 기존 Compose·마운트·환경변수·사용자·포트·보안 설정 유지. baseline rollback과 candidate repromotion 실제 실행 PASS. HTTPS health/웹/모바일/공통 UI/로고 11개 route PASS. A/Cloud/DB 변경 없음. 증적 `artifacts/workstation/mobile-b-rollout-20261009T072041Z/result.json`.
- 적용 후 B HTTPS 자산 10/10 현재 소스 해시 일치 PASS. 최초 503 자산 모두 HTTP 200. 증적 `artifacts/workstation/presentation-ui-inventory-1791530576087/result.json`.
- 현재 소스 Node 전체 742/742 PASS, exit 0, 43.336초. Python 배포 안전성 7/7 PASS. 새 안전성 검사는 누락·중복·범위 밖 정적 파일을 거부한다.
- 실제 Chrome HTTPS 브라우저 E2E PASS: 시연 로그인, 동의 201, DPoP 토큰·QIDO·WADO·픽셀 표시, 무인증 401·proof 누락/재사용 403, 토큰 UI/storage/URL/history 노출 없음, 동의 철회 후 픽셀 제거. 한 동의·토큰·철회 연결 확인. 증적 `artifacts/workstation/b-browser-2026-10-09T07-23-25.144652+00-00/result.json`.
- 브라우저 영상은 기존 **2×2 합성 영상**이다. 256×256 신규 팬텀 연결·전체 감사체인 재검증·모바일 실제 QR 브라우저·전체 MVP/v3 완료는 아직 미검증이다. 자동 브라우저의 DOM 조작은 전체 사람이 사용하는 화면 흐름의 접근성/사용성 검증을 대체하지 않는다.

다음 착수: 새 팬텀의 환자 소유권·기관 매핑·Control 메타데이터 등록 계약을 확인하고, 별도 동의 scope로 256×256/12-slice Viewer 연결을 구현·검증한다. C 환자 실영상 연결도 별도 본인 인증 계약으로 진행한다.

## 현재 관측

- Cloud Control: SSH strict host verification으로 실제 컨테이너 확인. 이미지 `sha256:7f0901aa0e7e8f6b70a07ee980dcb5c0cf480c6e4ea4fa17b28231ffd3d7009a`, healthy. PostgreSQL healthy. 최신 QR 상태 API 배포 기록과 이미지 일치. 업무 API E2E 성공을 의미하지 않는다.
- B HTTPS: 프로젝트 CA와 hostname 검증을 유지한 공개 자산 10개 비교. 일치 1, 불일치/비정상 HTTP 9. app.js·mobile app/sw/manifest는 HTTP 200이나 소스와 다름. ui/workspace.css·tokens.css·clinician.js·patient.js·로고는 HTTP 503. 없는 파일인지 라우팅 오류인지는 컨테이너 내부 조사 필요.
- 증적: `artifacts/workstation/presentation-ui-inventory-1791530068848/result.json`. 비교 FAIL은 최신 소스 미반영 판정이며 기존 업무 전체 장애 판정은 아니다.
- 로컬 Docker ps/image 조회: 15초 관측 제한 초과. Desktop/backend 프로세스는 존재. Engine 정상 여부와 timeout 원인은 NOT VERIFIED.
- A PACS 팬텀 24장 적재는 Runbook 기록이며 이번에는 재확인하지 않았다. 새 환자 매핑/Control 메타데이터/동의 scope 연결이 다음 데이터 작업이다.

## 화면과 API 연결

| 화면 행동 | 코드상 경로 | 구현 상태 / 다음 확인 |
|---|---|---|
| 환자·모바일 검사 목록 | GET /api/imaging-studies | 환자 principal 검사 존재; 새 팬텀 소유권·목록 연결 필요 |
| 환자 본인 영상 | POST /api/patients/{patient}/studies/{study}/self-view | 서버 소유권·감사 경로. 응답은 영상 바이트 API가 아니며 웹은 canvas 합성 그림 표시. 실제 영상 연결 계약 필요 |
| 동의 생성·철회 | POST /api/consents, POST /api/consents/{id}/revoke | 기존 흐름 유지. 최신 배포 브라우저 재검증 필요 |
| 모바일 QR | POST /api/consents/{id}/handoff-ticket, GET /api/consents/{id}/handoff-tickets/{ticket} | 클라우드 QR 상태 코드 배포 기록 확인. 최신 화면과 함께 사용/만료/철회 검증 필요 |
| 의료진 QR 사용 | POST /api/transfers/tickets/redeem-viewer | 기존 인증/DPoP/정책 흐름. 최신 영상 범위 재검증 필요 |
| 의료진 영상 | POST /api/dicom-access/request → /dicomweb/* | B에서 A Gateway로 전달·암호화 복호화. 새 팬텀 다중 슬라이스 E2E 미검증 |
| 감사·관리 | /api/audit-logs 등 | 관리자 역할 경계 유지; 발표 흐름 correlation/hash chain 확인 필요 |

관련 FR: 001~005, 006~013, 014~031, 032~041. 현재 작업은 API/DB 정책 변경 없이 배포 자산 정렬을 준비한다.

## 준비한 배포 구성

`Dockerfile.presentation-ui`는 역할별 검증된 기반 이미지 위에 웹 루트 JS/CSS/HTML, ui, mobile, brand, images, assets를 복사한다. 서버 코드·ENTRYPOINT·설정은 기반 이미지에서 상속한다. `.dockerignore`의 clinical 제외를 유지하고 mockups는 복사하지 않는다. 기존 이미지에 이미 있는 파일의 삭제를 보장하지 않으므로 기반 이미지 검증은 별도로 필요하다.

`scripts/presentation-ui-manifest.js`는 현재 복사 대상 31개 자산의 해시를 출력한다. `--image sha256:<ID>`는 네트워크·포트·mount 없이 이미지 파일을 비교한다. 이 검사는 정적 자산 일치만 검증하며 취약점 검사·API 계약·브라우저 E2E를 대체하지 않는다.

```powershell
node scripts/presentation-ui-manifest.js
# B 현재 이미지 ID를 SSH Docker inspect로 재확인한 뒤 사용한다.
docker tag sha256:<verified-B-image-ID> mediq-presentation-base:<unique-tag>
docker image inspect mediq-presentation-base:<unique-tag> --format '{{.Id}}'
docker build --pull=false -f Dockerfile.presentation-ui --build-arg CAPSTONE_BASE_IMAGE=mediq-presentation-base:<unique-tag> -t mediq-presentation-ui:<unique-tag> .
docker image inspect mediq-presentation-ui:<unique-tag> --format '{{.Id}}'
node scripts/presentation-ui-manifest.js --image sha256:<candidate-image-ID>
# 기존 Container Security Gate를 새 image ID 대상으로 실행한다.
# 원본 Compose 구성·mount·environment를 유지하는 기존 app-only 배포 절차로 적용한다.
node scripts/presentation-ui-live-check.js
```

## 다음 작업

1. 로컬 Docker Engine 응답 회복 또는 승인된 기존 빌드 환경 사용. 원인 확인 후 불필요한 재시작과 데이터 삭제 없이 처리한다.
2. A/B 실제 이미지 ID·mount·Compose context 조사. B 소스 자산 HTTP 503의 원인 확인.
3. UI 후보 이미지 생성, 31개 파일 일치 확인, Container Gate, B 포털 배포·rollback·브라우저 정상/거부 경로 검증.
4. 신규 합성 환자·Study/Series 정식 등록과 scope 동의; 환자 실제 영상 접근은 의료진 토큰 재사용 대신 본인 인증 계약으로 설계·검증.
5. Key Vault·mTLS·QR·Viewer·감사·철회 단일 E2E, 재시작/반복 시연, 문서 동결·독립 검토.

## 이번 검증

- manifest 스크립트 문법 및 로컬 자산 열거 PASS.
- A/B 이동·환자 검색·QR 상태 관련 Node 10/10 PASS, exit 0.
- B 배포 자산 비교 FAIL, exit 1. HTTPS 연결 검증 완화 없음.
- 이미지 빌드·이미지 내부 파일 검사·새 Container Gate·배포·rollback: NOT VERIFIED.
- 전체 MVP 달성: 미완료.
