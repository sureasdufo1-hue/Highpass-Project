# 다음 실행 — 등록된 다른 환자·기관의 동의 증적 격리 행렬

2026-10-08 / DRAFT / UNASSIGNED. 이전 계획 채택 검토자·승인자 김범희.
CON-006, IAM-003/004, TEN-003, AUTH-001/004, V3-AT-CON-004,
FR-001~005/014~020/037~041. 목표 전체 MVP/v3는 유지한다.

1. 최신 actual nonowner 취소/결정 경쟁 증적, 007/008의 ref ownership/registry,
   024/026 RLS와 private registry/factory/service를 확인한다. random UUID actor
   거부만으로 실제 등록된 다른 환자·기관 격리를 주장하지 않는다.
2. owned synthetic DB에 같은 source의 다른 PatientRef+등록된 PATIENT와
   다른 tenant/hospital의 소유 ref+등록된 PATIENT를 적법한 fixture 생성 tuple,
   등록 증적 및 테스트 issuer로 구성한다. 실제 환자·직접 영상·secret 출력은 금지한다.
3. 실제 서명 TestProvider→private registry binding→제한된 nonowner pool 경로로
   본인 동의 증적 read는 positive, 다른 registered patient/tenant에서 원래
   7개 동의 테이블 SELECT는 0행을 확인한다. source/target INVITED·임의 admin
   주체는 별도 negative로 구분한다. 증적 관리자 읽기 권한은 새로 추가하지 않는다.
4. 서비스의 원래 preparation/challenge/decision key에 대한 foreign 요청은
   uniform safe deny이며 raw nonce가 있어도 authority가 되지 않음을 실제 시험한다.
   조회와 INSERT 실패, app principal 변경/복사·scope mismatch를 구분한다.
5. 실제 INSERT RLS/CHECK와 immutable audit/event/receipt tuple을 우회해
   외부 actor·patient·tenant를 바꾸려 하면 원자적으로 실패하고 행 수가
   유지되는지 시험한다. 적대 query는 owned fixture에서만, SQL parameter binding 사용.
6. PG 후 전체 Node 순차 실행, source hashes/manifest·secret scan·exact cleanup,
   신규 증적 DRAFT / UNASSIGNED. 완전한 전체 D6·production isolation과 구분한다.
7. 철회 ADR의 L1~L5 정책 응답을 확인한다. L1 질문 미응답을 승인으로 간주하지
   않는다. 실제 답변 전 withdrawal/expiry 신규 권한·scope·API를 활성화하지 않는다.
   가능한 안전한 잔여 기능·계약 검증은 진행한다.

runtime DB 변경·commit/push/merge/PR·TLS/RLS/재인증 완화 금지.
