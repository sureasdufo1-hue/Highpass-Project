# 환자 승인 준비 조회 — guarded service 실행 결과

2026-10-08 / TECHNICAL TEST ONLY / DRAFT / UNASSIGNED.
정책 검토자·승인자: 김범희. 정책 승인일: 2026-10-08.
이 기록은 신규 기술 증적에 대한 독립 사람 검토 PASS가 아니다.

## 목적·기존 구조·요구사항

[실행 프롬프트](../implementation/highpass-v3-p0-06-patient-guarded-projection-prompt.md)의
환자 전용 조회 helper를 구현했다. 기존024 최소 컬럼 RLS, private principal registry,
tenant transaction과023 SQL canonical digest를 재사용했다. 관련 CON-001..006,
IAM-003/004, AUTH-004, TEN-003, FR-001..005/014..020. 임상 승인·Grant는 아직 없다.

## 변경

- 생성: `src/v3-patient-approval-projection.js`, 해당 단위 테스트,
  `scripts/test-support/patient-approval-projection-fixture.js`.
- 수정: `scripts/v3-patient-ceremony-schema-check.js`의 실제 helper 검증·source hashes.
- 문서: [조회 계약](../api/highpass-v3-patient-approval-projection-contract.md),
  [Master Plan](../implementation/highpass-v3-p0-master-plan.md), 추적성 및 후속 프롬프트.

서명된 합성 재인증·PATIENT·consent:approve·private binding을 DB 획득 전 확인한다.
approval capability 이외 role membership, owner/admin/BYPASSRLS는 registry RLS 계획 전
거부한다. Session SHARE→PatientRef SHARE→수신 병원 SHARE→수신 tenant SHARE 이후
현재 parent/version·기관·참조·scope/actions/window를 재검증한다. source registry는
기존 transaction에서 선행 잠금한다. SQL이 exact timestamp로 생성한 canonical digest를
사용하며 freeze한 snapshot의 provenance는 같은 binding·살아 있는 transaction에만
유효하다. 반환 직전 DB/wall-clock 재인증·만료를 다시 검사한다.

## 실제 검증

| 명령·검증 | 결과 | 종료 코드·근거 |
|---|---|---|
| `node --check scripts/test-support/patient-approval-projection-fixture.js` | PASS | 0 |
| `node --test test/v3-patient-approval-projection.test.js` | PASS | 0, 7건, 299.2889ms |
| `node --test` | PASS | 0, 437건, 38,407.8813ms |
| `node scripts/v3-patient-ceremony-schema-check.js` | PASS | 0, 75건, 44,471ms; 앞선 정상 실행도75건 PASS |
| `node scripts/v3-identity-transaction-check.js` | PASS | 0, 427건, 78,199ms |
| manifest digest/current source hashes | PASS | 0, 각각29/70개 일치 |
| 소유 fixture cleanup·최종 label inventory | PASS | 0, 관련 컨테이너 없음 |

75건은 기존 SQL61건 + 실제 helper13건 + cleanup1건이다. helper 정상 경로, SQL digest
일치·private brand·다른 준비 ID·stale version·복제/재인증 없는 binding·owner/mixed pool·
폐기 principal·정지 수신기관·반환 전 재인증 만료 rollback·실제 Session lock wait·
side effect 없음·실제 짧은 준비 요청 만료·감사 증적과 함께 커밋된 Session 취소 후
version mismatch DENY를 포함한다. 마지막 두 상태는 임시 fixture의 정상 제약을
지켜 구성했다. trigger/RLS를 끄거나 runtime 데이터를 바꾸지 않았다.

최신 증적:

- [환자 조회 manifest](../../evidence/generated/hp-v3-ceremony-schema-2026-10-08T03-33-47-564Z-c40d5a33/manifest.json)
- [기존 회귀 manifest](../../evidence/generated/hp-v3-identity-tx-2026-10-08T03-30-16-294Z-4e65a210/manifest.json)

Repository SHA: `59dff9d8fd5ed9d1e600e161ec2b3e4d57356cbc`.
미커밋 코드 기준 정확한 대상은 manifest source hashes다. 신규 증적 DRAFT/UNASSIGNED.

## 초기 실패 보존

단위 테스트 첫 실행은 합성 JWT fixture의 필수 patientId 누락으로7건 실패했다.
fixture만 보완했고 인증 요구는 유지했다. 실제 PG 첫 두 실행은 테스트 비교 SQL의
존재하지 않는 `digest(bytea,text)` 호출(42883)이 원인이었다. PostgreSQL 내장
`sha256(bytea)`로 oracle을 수정했다. helper·RLS·TLS 통제를 완화하지 않았다.

- [첫 PG 실패](../../evidence/generated/hp-v3-ceremony-schema-2026-10-08T03-28-22-085Z-784f1d59/manifest.json)
- [enum 진단 실패](../../evidence/generated/hp-v3-ceremony-schema-2026-10-08T03-29-25-811Z-13d3fa24/manifest.json)

이전 실패는 FAIL로 남으며 최신 PASS가 소급 수정하지 않는다. raw PG 메시지·query
parameter는 출력하지 않고 안전한 enum만 기록한다.

## 위험·미검증·다음 단계

내부 helper는 public API가 아니므로 mandatory read audit/HTTPS/UI가 아직 없다.
실제 PG는 random loopback port의 독립 합성 DB이며 TLS 운영 DB 검증이 아니다.
서명된 재인증은 mock assurance이지 실제 MFA/본인확인이 아니다. full Node는 live E2E
스크립트를 실행하지 않으므로 full MVP/HTTPS PASS를 대신하지 않는다.

이 게이트의 scoped PASS는 D6 전체 approval↔withdraw/기관/Grant 경합 PASS가 아니다.
challenge issuance/nonce 원문 보호·exactly-once consumption·불변 내용/상태 이벤트·
승인/거절·철회·Decision/Grant·기관 수락·최종 Viewer까지 남아 있다.
다음은 [challenge issuance 계획](../implementation/highpass-v3-p0-06-patient-challenge-issuance-prompt.md).
전체 Highpass MVP/v3 완료는 선언하지 않는다. 운영 IdP/KMS/PACS와 법률·ISMS-P·병원
승인은 기존 DEFERRED/BLOCKED를 유지한다. commit/push/merge/runtime 배포 없음.

권장 커밋 분리: (1) patient projection helper/unit tests (2) owned PG fixture/증적
수집 변경 (3) 계약·추적성·검증 보고. 사용자 다른 미커밋 변경은 포함 여부 별도 검토.
