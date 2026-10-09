# 다음 게이트 — 환자 결정 COMMIT deadline·실제 lock 경쟁 증명

2026-10-08 / DRAFT / UNASSIGNED. 계획 채택 검토자·승인자 김범희.
CON-001~006, AUTH-001/004, TEN-003, FR-001~005/014~020/037~041.

1. 최초 동의 결정 저장 및 직접 RLS 결과, 026, private factory/service,
   parent lifecycle lock 순서를 먼저 확인한다. 이전 PASS를 이번 코드의 PASS로 복제하지 않는다.
2. owned synthetic PG에서 신규 challenge가 실제로 만료된 경우 결정·원본 receipt
   재조회 정책을 각각 시험한다. receipt는 과거 결정 증명이고 새 authority가 아님을 유지한다.
3. INSERT 이후 COMMIT 이전에 challenge/준비/parent/private reauth deadline이
   지나도록 유한한 synchronization barrier를 구성한다. 모든 7개 신규 테이블의
   증가가 없음을 실제 DB로 확인한다. 공개 sleep 옵션 또는 runtime 테스트 bypass를 추가하지 않는다.
4. 별도 connection이 Session·기관·환자 참조 lock을 보유했음을 pg_stat_activity/
   pg_locks 같은 비민감 관측으로 증명하고, 기다린 실제 결정이 deadline을 넘기면
   실패 닫힘·bounded 종료·원자적 rollback을 확인한다. Promise.all만으로 lock 경쟁 완료를 주장하지 않는다.
5. 승인/거절과 실제 감사된 취소·만료·기관 중지·reference 삭제 경쟁을 작은
   케이스부터 확장한다. withdraw는 아직 구현되지 않았으면 별도 후속 lifecycle gate로 남긴다.
6. heavyweight PG와 전체 Node를 순차 실행해 deadline 시험 자원 경합을 줄인다.
   실제 실패는 기록한다. 무한 polling 금지; fixture 생성·readiness·query·cleanup 모두 bounded.
7. 최신 source hash/manifest·secret scan·cleanup 결과를 DRAFT / UNASSIGNED로
   등록하고 다음 withdraw/expiry 구현 프롬프트를 작성한다. 임상 ALLOW·Grant·공개 HTTP
   경로 또는 전체 MVP/v3 완료는 이번 결과로 선언하지 않는다.

runtime DB 및 사용자 기존 변경 보존. 실제 환자/secret/raw nonce 기록,
TLS/RLS/재인증 완화, commit/push/merge/PR 금지.
