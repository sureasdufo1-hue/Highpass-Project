# Highpass–Privacy Filter 비운영 연동 준비 및 제안 채택 기록

기준일: 2026-10-08 (Asia/Seoul)  
검토자: 김범희  
승인자: 김범희  
검토일·승인일: 2026-10-08  
판정: APPROVED — 비운영 연동 준비 계획 채택  
근거: 사용자의 “제안사항 채택하여 진행, 검토자 승인자 모두 김범희” 지시  
관련 요구사항: FR-042~FR-046, PF-R01~PF-R06, PF-R10~PF-R11, PF-R14  
분석 기준 HEAD: `59dff9d8fd5ed9d1e600e161ec2b3e4d57356cbc` (미커밋 작업 트리 포함)

> CAPSTONE MVP / TECHNICAL TEST ENVIRONMENT ONLY — NOT A PIPA LEGAL DETERMINATION, ISMS-P CERTIFICATION, HOSPITAL SECURITY APPROVAL, OR PRODUCTION READINESS CLAIM

## 1. 승인 범위와 한계

채택한 제안은 비운영 URL·OpenAPI·인증 계약을 확인하고, 품질 결함 보완 → 검증 → 비운영 연동 시험 순서로 진행하는 계획이다. 합성 텍스트만 대상으로 하며 실제 환자정보, 실제 병원 시스템, 외부 추론 전송, Production 배포는 승인 범위에 포함하지 않는다.

김범희의 이번 승인은 프로젝트 계획 채택 기록이다. 모델별 사용권·기관 승인, 법률 검토, 잔존 개인정보 해소, 실제 연동 성공 또는 신규 시험 증적의 PASS 판정으로 대신 사용하지 않는다. 검토자와 승인자가 동일하므로 이번 기록을 **독립 검토 완료**라고 표현하지 않는다. 신규 기술 증적은 별도 사람이 실제 결과를 검토하기 전까지 `DRAFT / UNASSIGNED`로 관리한다.

이 문서는 서버의 `approved_use_ref`를 생성·갱신하지 않는다. 파일 등록만으로 API 권한이나 데이터 반출 권한이 생기지 않는다.

## 2. 확인된 실제 연동 계약

| 항목 | 현재 저장소 근거와 판정 |
| --- | --- |
| 외부 Staging Base URL | 제공된 실제 주소 없음. `NOT VERIFIED / BLOCKED — EXTERNAL RESOURCE REQUIRED` |
| 로컬 HTTPS | Compose 기본 구성은 `https://localhost:3443`이며 포트 변경 가능. 현재 기동·접속은 이번 작업에서 검증하지 않음 |
| Privacy 경로의 공개 HTTPS 연결 | `scripts/edge-proxy.js`의 API 전달 목록에 `/internal/privacy/`가 없음. 그 경로는 Viewer upstream으로 전달되므로 위 주소를 Privacy API 접속 주소로 제공하지 않음 |
| OpenAPI | [Privacy Internal API](../api/highpass-privacy-internal.openapi.yaml), 버전 `1.0.0` |
| 요청 스키마 | [text inspection schema](../../schemas/privacy-text-inspection.schema.json) |
| API 호출 방향 | 내부 서비스 → Highpass 내부 inspection API → 로컬 Python bridge/명시적으로 준비된 checkpoint |
| readiness | `GET /internal/privacy/health/ready` |
| inspection | `POST /internal/privacy/text-inspections`, `Content-Type: application/json` |
| 실제 인증 | `X-HiPass-Service-Token` 헤더를 `HIPASS_INTERNAL_SERVICE_TOKEN`과 비교. `INTERNAL_SERVICE` 역할 필요 |
| 서비스 권한 | 현재 내부 토큰 principal은 `privacy:inspect`, `audit:write`, `gateway:introspect`를 함께 보유. Privacy 전용 최소권한 자격증명으로 분리하기 전 외부 제공 금지 |
| OAuth2/Token URL/iss/aud/JWKS/TTL | 이 Privacy 내부 토큰 경로에는 구현된 OAuth2 발급·JWT 검증 계약이 없음. 향후 전환 후보이며 현재 제공 가능한 값으로 작성하지 않음 |
| 정책 승인 | 서버 registry의 requester·기관·목적·수신자·artifact·version·기간 등을 model 호출 전에 검증 |
| 목적 | `RESEARCH`, `TEACHING`, `DEMO`, `AI_LOCAL`; `CLINICAL` 제외 |
| 처리 한도 | JSON body 40 KiB, 텍스트 UTF-8 32 KiB, 동기 2,048 tokens |
| adapter 제한 | child 실행당 기본 15초, 동시 실행 1, 대기열 8. 다단계 처리·대기시간 전체의 HTTP end-to-end deadline을 보장한다는 의미는 아님 |
| 실패 처리 | 인증 401/403, 입력 413/415/422, queue 429, model 503/504 등 typed 오류. 원문 fallback/자동 반출 금지 |
| 정상 처리 | `SUCCEEDED`여도 `REVIEW_REQUIRED`, `PENDING`, `releaseEligible: false`. 검사 성공 ≠ 반출 승인 |
| DICOM·OCR·픽셀 | 이번 PF-1 텍스트 API 범위 제외. Header/픽셀 비식별 완료로 확대 해석 금지 |

OpenAPI의 response 상세 schema·502 응답 등 runtime 정렬, HTTP 전체 deadline과 안전한 재시도 정책은 다음 계약 보완 작업이다. OAuth2/mTLS 전환은 기존 계약 영향 검토 후 별도 단계로 구현하며, 내부 HTTP 포트를 외부에 열거나 TLS 검증을 완화하여 임시 연동하지 않는다.

확인한 계약 파일 SHA-256:

- OpenAPI: `1A0AECE3DF1D139FE610A9A9CC1E1884F3F8701DCB9E0CE5A473365246CA8BF6`
- 요청 schema: `9E78E8D4C0169005C2093DBA59406D1B2FD4B6FDD631D56E7E9FDB3305244B43`

## 3. 이번 재검증

| 명령·확인 | 종료 코드 | 결과 | 범위 |
| --- | --- | --- | --- |
| `node --test test/privacy-filter.test.js` | 0 | PASS: 21/21, 1,266.7847 ms | 합성 규칙·fake adapter·Unicode·오류·반출 차단 단위 시험 |
| `node scripts/privacy-model-smoke.js` | 2 | NOT VERIFIED / ENVIRONMENT BLOCKED | `MODEL_UNAVAILABLE / EXPLICIT_CHECKPOINT_REQUIRED`; 실제 모델 추론 실행 못함 |
| HTTP·TLS·외부 Staging 실연동 | 미실행 | NOT VERIFIED | 현재 서버·인증서·외부 자원 검증 별도 필요 |

PowerShell에서는 smoke 명령 뒤 `exit $LASTEXITCODE`로 Node의 실제 종료 코드 2를 전달해 확인했다. 이번 표는 재실행 결과 요약이며 승인된 독립 증적이 아니다.

받은 설명의 Recall 95.83%, 개인정보 잔존 후보 1건, 0.21~0.26건/초, 회귀 165건, 모델 가중치·해시 검증 완료는 **외부 전달 주장 / NOT VERIFIED**로 분류한다. 해당 평가셋·model digest·manifest·원본 시험 결과를 이번에 확보하지 않았으며, 저장소의 실제 모델 smoke 차단을 이 수치로 덮지 않는다.

## 4. 채택한 실행 순서와 종료 조건

1. **로컬 모델 준비 계약 확정**: 모델·dependency 고정 revision, 사용권, checkpoint SHA-256, 비밀정보 제외 인계표 확보. 승인된 경로에서 준비한 checkpoint와 Python 환경으로 `privacy:model-smoke` 실행. 현재 checkpoint 부재로 차단됨; 임의 다운로드하지 않음.
2. **API·인증 계약 보완**: 실제 response/error schema, 전체 timeout·재시도, 서비스별 최소권한 identity, TLS 신뢰·네트워크 allowlist·secret 교체 정책 확정. 현재 공개 edge 경로를 무심코 추가하지 않음.
3. **품질·잔존 후보 재현**: 전달받은 결함을 허가된 합성 fixture로 재현하고 한국어 미탐 보완. 고정 평가셋·정책·rules·모델 digest로 재검증; 잔존 후보 미해소 상태에서 반출 허용 금지.
4. **격리 로컬 HTTP 통합 시험**: 정상·무인증·권한 부족·승인 binding 불일치·model 장애·timeout·누출·재시작을 유한한 timeout으로 시험. 실제 모델과 fake adapter 증적을 분리.
5. **실제 비운영 환경 연동**: 실제 URL·네트워크·인증서·전용 서비스 자격증명 제공 후 시행. 자원 부재는 BLOCKED로 유지. 로컬 결과를 외부 Staging PASS로 대체하지 않음.
6. **결과 검토·후속 승인**: SHA/digest에 묶인 새 증적과 잔여 결함을 검토. 독립성이 요구되는 검증은 별도 검토자를 지정하거나 독립 검토 미충족을 기록. 운영 승인·법무·PIPA·ISMS-P는 별도 DEFERRED 항목.

현재 바로 필요한 입력은 승인된 로컬 checkpoint 위치·SHA-256·고정 runtime 정보다. 실제 secret, Access Token, 개인키, 환자정보는 이 문서나 채팅에 입력하지 않는다. 모델 자원이 제공되기 전에도 2번의 문서·계약 보완은 진행 가능하다.

## 5. 담당자에게 전달할 답변

> 제안하신 비운영 연동 준비 계획을 채택합니다. 검토자와 승인자는 김범희이며 검토·승인일은 2026-10-08입니다. 승인 범위는 합성 데이터 기반 기술 검증 준비이며 기관 운영 승인이나 Production 배포 승인이 아닙니다. 현재 Highpass의 Privacy OpenAPI는 `docs/api/highpass-privacy-internal.openapi.yaml`이며 내부 서비스 토큰 방식입니다. 외부 Staging URL과 OAuth2 계약은 아직 확정되지 않았고, 공개 HTTPS proxy에 Privacy API 경로도 연결되지 않았습니다. 실제 모델 checkpoint 준비, 최소권한 인증·TLS 계약 보완, 품질 결함 재검증 후 비운영 연동 시험을 진행하겠습니다. 21개 합성 단위 시험은 통과했지만 실제 모델과 외부 실연동은 미검증입니다.
