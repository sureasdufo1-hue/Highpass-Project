# 다음 gate — Consent lifecycle additive DDL 조립·권한 검증

2026-10-08 / DRAFT / UNASSIGNED. L1~L5 정책 채택: 김범희, 2026-10-08.
V3-FR-CON-003/005/006, V3-SR-AUTH-004/AUD-001/TEN-001, FR-001~005/014~025/037~041.

1. 승인 정책 패킷, lifecycle ADR/API, 순수 withdrawal command 결과와 026 초기
   동의 조립·deferred guard·RLS를 읽는다. 초기 event1/2·content/scopes/actions/receipt 불변 유지.
2. 실제 predecessor ACTIVE event2에 묶인 별도 terminal event3를 설계한다.
   consent/content/source/subject/실제 actor/sequence/time 전체 tuple 검증, event 중복 금지.
3. WITHDRAWN은 인증·재인증·live own ref/source ACTIVE인 PATIENT의 별도 capability;
   parent terminal/target stop에 의존하지 않는다. EXPIRED는 별도 실제 CONSENT_EXPIRY
   서비스 identity, subject와 actor 구분. 기존 SESSION_EXPIRY 권한을 확장·혼합하지 않는다.
4. immutable reciprocal audit, actor/source/op HMAC typed receipt, cascade REQUESTED를
   정확한 terminal event에 원자적으로 연결한다. downstream ACK·Grant 구현 claim 금지.
5. expiry effectiveAt=validUntil, recordedAt=DB 기록 시각. worker 없이도 logical expiry는
   authority DENY. 과거 challenge 만료 guard를 후속 terminal에 재적용하지 않는다.
6. 별도 최소권한 nonowner/FORCE RLS fixture에서 own positive 및 foreign subject/source,
   wrong actor/purpose/state/sequence/time, 누락·중복·변조 조립과 COMMIT rollback을 검증한다.
   사용자 runtime DB에 migration/enrollment하지 않는다. 신규 공개 HTTP/clinical 권한 비활성 유지.
7. gate의 source hash closure, exact owned container cleanup/부재, timeout, secret scan,
   manifest 검증과 Node 회귀를 기록한다. 실행하지 않은 테스트는 NOT VERIFIED.
8. 이후 private withdrawal/expiry 서비스 → 실제 경합·lost ACK → audited minimal read 순서.

DDL 물리 계약 review와 fixture 실행 전에는 서비스 완료/PASS를 선언하지 않는다.
신규 증적 DRAFT / UNASSIGNED; 전체 MVP/v3 미완료. commit/push/merge/PR 및 보안 완화 금지.
