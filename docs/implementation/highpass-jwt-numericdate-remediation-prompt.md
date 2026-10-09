# 다음 실행 프롬프트 — JWT registered claim 타입 fail-closed 보완

2026-10-07 / P0-04 crypto·registry 검증 중 기존 validateRegisteredClaims의
`Number(claims.exp)` 비교가 NaN에서 fail-closed하지 않는 것을 발견했다.
v3 경계만 방어하고 legacy를 방치하지 않는다. 보안 우선순위에 따라 repository 구현 전에 보완한다.

기존 auth API/정상 token 계약을 유지하면서 sub는 nonempty string,
exp와 선택 iat/nbf는 finite number NumericDate로 검증한다. 숫자 문자열·object·null·NaN은 거부한다.
표준 NumericDate의 유한 소수는 허용한다(v3 registry의 별도 정수 정책과 구분).
오류 메시지에 claim/token을 반영하지 않는다. 실제 signed synthetic JWT로 정상·오류 타입,
미래/만료 조건, HS256 signature 경계를 검증하고 전체 회귀를 수행한다.

기존 검토 승인은 변경 코드에 자동 승계하지 않는다. external IdP 및 실제 HTTPS 컨테이너
재검증은 별도 최신 증적 gate로 남긴다. commit/push/merge/PR 없음.
관련: V3-SR-IAM-001, FR-014~025. 완료 후 P0-04 transactional repository/service/API를 계속한다.
