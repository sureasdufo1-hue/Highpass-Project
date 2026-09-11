# Phase 5 증적 독립 검토 체크리스트

상태: `READY FOR HUMAN REVIEW / DRAFT`
자동 사전검증일: 2026-09-12
최신 증적 실행 디렉터리: `evidence/generated/2026-09-11T21-51-53-172Z/`
증적이 가리키는 구현 SHA: `ee7fc6eafdef1c03c413973def1f08528b0fb599`
원격 반영 병합 SHA: `f2ac3315634d7001d45fad20bf9fa4e1e28f2301` (동일 트리)

## 자동 사전검증

```powershell
pnpm run compliance:evidence:verify
pnpm run security:secrets
```

사전검증 결과는 최신 manifest의 증적 9/9 파일 존재·SHA-256 일치·경로 confinement PASS, 비밀정보 scan 0건이다. 모든 증적은 계속 `DRAFT / UNASSIGNED`이며 자동검증은 독립 검토자의 승인이 아니다.

## 독립 검토자 확인

- [ ] manifest의 repository SHA가 승인 대상 구현 SHA와 일치한다.
- [ ] 9개 sourcePath가 동일 실행 디렉터리에 있고 SHA-256이 일치한다.
- [ ] 실행 결과와 요약 문서 사이에 PASS/FAIL/NOT VERIFIED 불일치가 없다.
- [ ] 실제 개인정보, 개인키, 원문 token, secret가 포함되지 않았다.
- [ ] 외부 Staging·병원망·실제 PACS·법률/인증 항목이 PASS로 과장되지 않았다.
- [ ] 예외와 유효기간을 확인했다.

## 승인 기록

| 항목 | 입력 |
|---|---|
| 검토자 | UNASSIGNED |
| 검토일 | UNASSIGNED |
| 판정 | DRAFT |
| 예외/의견 | UNASSIGNED |
