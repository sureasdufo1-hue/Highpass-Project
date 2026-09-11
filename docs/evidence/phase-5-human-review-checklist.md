# Phase 5 증적 독립 검토 체크리스트

상태: `REVIEW REQUIRED / DRAFT`
자동 사전검증일: 2026-09-12
최신 증적 실행 디렉터리: `evidence/generated/2026-09-11T23-27-45-536Z/`
증적이 가리키는 구현 SHA: `222a7b6d05a38d4700d65e93af5cce5ae25337ca`
원격 반영 병합 SHA: `222a7b6d05a38d4700d65e93af5cce5ae25337ca` (runtime implementation baseline)

## 자동 사전검증

```powershell
pnpm run compliance:evidence:verify
pnpm run security:secrets
```

사전검증 결과는 최신 manifest의 증적 9/9 파일 존재·SHA-256 일치·경로 confinement PASS, 비밀정보 scan 0건이다. manifest 내부의 생성 당시 `reviewStatus=DRAFT`, `reviewer=UNASSIGNED` 값은 원본 증적으로 보존하며, 독립 검토 판정은 아래 승인 기록에 별도로 남긴다.

## 독립 검토자 확인

- [ ] manifest의 repository SHA가 승인 대상 구현 SHA와 일치한다.
- [ ] 9개 sourcePath가 동일 실행 디렉터리에 있고 SHA-256이 일치한다.
- [ ] 실행 결과와 요약 문서 사이에 PASS/FAIL/NOT VERIFIED 불일치가 없다.
- [ ] 실제 개인정보, 개인키, 원문 token, secret가 포함되지 않았다.
- [ ] 외부 Staging·병원망·실제 PACS·법률/인증 항목이 PASS로 과장되지 않았다.
- [ ] 예외와 유효기간을 확인했다.

## 이전 기준선 승인 기록

| 항목 | 입력 |
|---|---|
| 검토자 | 김범희 |
| 검토일 | 2026-09-12 |
| 판정 | PASS |
| 예외/의견 | 없음 |

위 승인 기록은 구현 SHA `ee7fc6eafdef1c03c413973def1f08528b0fb599` 기준의 독립 기술 증적 검토 결과다. 이후 Mobile-Core Device Registry 코드가 추가되어 현재 기준선에는 재검토가 필요하다.

## 현재 기준선 승인 기록

| 항목 | 입력 |
|---|---|
| 검토자 | UNASSIGNED |
| 검토일 | UNASSIGNED |
| 판정 | DRAFT |
| 예외/의견 | UNASSIGNED |

현재 기준선의 재검토가 완료되기 전까지 `DRAFT / UNASSIGNED`를 유지한다. 모든 판정은 합성 로컬 MVP 기술 증적 범위에 한정하며 PIPA·ISMS-P·병원 운영 승인 상태를 변경하지 않는다.
