# v3 PatientMapping 식별자 보호 계약

2026-10-07 / CAPSTONE-P0 / IMPLEMENTATION CONTRACT, runtime activation pending.
사용자 요청의 지속 실행 범위에서 기존 opaque-string 계약을 구체화하며 API 경로·필드 이름을 유지한다.

## 확인된 요구사항과 결정

- 확인됨: protected local ref와 keyed digest 분리, tenant/hospital 격리, no automatic merge.
- 가정: 보호값을 발행하는 로컬 Gateway/서버는 별도 인증된 신뢰 주체이며 HTTP 클라이언트 주장만으로 신뢰하지 않는다.
- 결정: `protectedLocalRef`는 canonical UTF-8 JSON envelope의 unpadded base64url이다.
  JSON 필드 순서는 `v, alg, keyId, nonce, ciphertext, tag`이며 추가/중복 필드를 거부한다.
  `v=1`, `alg=A256GCM`, nonce 12 bytes, tag 16 bytes, ciphertext 1~256 bytes이다.
  전체 encoded 문자열은 최대 4096 chars이다. DB bytea는 decoded UTF-8 envelope를 저장한다.
- localRef는 정확한 UTF-8 문자열 1~256 bytes이다. NUL/control characters, malformed surrogate를 거부한다.
  trim/case-fold/Unicode normalization을 하지 않는다. 공백·대소문자가 다른 ID를 자동 합치지 않는다.
- AAD는 JSON array `["HPV3-LOCAL-REF",1,"A256GCM",keyId,tenantId,hospitalId,patientRefId]`이다.
  context UUID는 lowercase로 canonicalize한다. caller-supplied context는 서비스가 인증 principal과 대조해야 한다.
- lookup digest는 독립 256-bit key의 HMAC-SHA-256 over
  `["HPV3-LOCAL-LOOKUP",1,tenantId,hospitalId,localRef]`이다. patientRefId는 제외한다.
  동일 병원의 동일 localRef가 다른 PatientRef로 제출되면 같은 digest가 되어 DB 중복 충돌로 드러난다.
  digest는 canonical base64url 43 chars / DB 32 bytes이며 응답·로그에 반환하지 않는다.

## 신뢰·키 수명주기

검증기는 configured keyId로 복호/AAD/tag를 검증한 후 HMAC을 재계산해 timingSafeEqual로 확인한다.
형식만 맞는 보호값이나 클라이언트 digest를 신뢰하지 않는다. 평문은 함수 내부 메모리에만 두고
반환하지 않는다. 결과는 저장용 protected bytes/digest와 비밀이 아닌 algorithm/keyId뿐이다.
metadata 응답 필드 whitelist는 별도 서비스 책임이다.

암호화 key ring과 별도 lookup key는 외부에서 32-byte Buffer로 공급한다. 동일 key 재사용을 거부한다.
keyId는 비밀이 아닌 내부 버전 label이다. encryption rotation은 새 active keyId로 발행하고
retained keyId로 기존 envelope를 검증할 수 있다. 제거된 keyId는 검증 실패다.
lookup key는 매핑 수명 동안 고정한다. 교체 시 검색 digest reindex/dual-key 충돌 점검이 필요하며
이를 자동 수행하거나 단순 encryption rotation으로 대체하지 않는다.

CSPRNG 96-bit nonce를 사용한다. 테스트의 nonce 중복 0은 모든 실행의 무충돌 보장이 아니다.
대규모 운영의 per-key 사용량 제한·rotation·KMS/HSM·Gateway credential provisioning은 별도 전환 gate다.
dispose는 owned Buffer를 zeroize하고 재사용을 차단하지만 JS/OpenSSL 전체 메모리 삭제 인증은 아니다.
원본 localRef 입력 문자열은 호출자가 관리하며 런타임 GC 전체 삭제를 보장하지 않는다.

## 미완료 경계

principal registry의 로컬 모듈은 기존 Test/OIDC JWT 인증 후 고정 issuer+subject를 서버 UUID에 연결한다.
token/registry role·hospital·scope를 모두 확인하고 body/header context는 무시한다.
이는 정적 provisioning snapshot이며 실시간 철회와 DB ACTIVE 검사는 후속 repository 책임이다.
현재 모듈은 HTTP 경로에 연결되지 않았다. 상세 시험은
[P0-04 실행 결과](../governance/highpass-v3-p0-04-identity-security-2026-10-07.md)를 따른다.

아직 actual authenticated Gateway 발행, registry의 runtime/DB 연결, API 연결, transactional audit,
VERIFIED 사람 검토 workflow, KMS/HSM 및 key rotation 운영은 완료되지 않았다.
암호화 성공은 localRef↔환자 연결의 진실성·동의·기관 승인·VERIFIED 상태를 증명하지 않는다.
모든 보호값은 민감정보로 취급한다. 예외는 고정 사유 코드이며 raw 입력/키/cause/stack을 API에 반환하지 않는다.

구현은 표준 암호 연산을 [Node.js crypto API](https://nodejs.org/api/crypto.html)에 위임하며
새 암호 알고리즘이나 JWE·KMS 적합성 인증을 주장하지 않는다.
