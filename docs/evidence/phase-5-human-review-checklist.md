# Phase 5 증적 독립 검토 체크리스트

상태: `READY FOR HUMAN REVIEW / DRAFT`
자동 사전검증일: 2026-09-09
최신 기준 구현 SHA: `1754f259a5e06b6a6ca96a13f0e132d30c7b058d`

## 자동 사전검증

```powershell
pnpm run compliance:evidence:verify -- evidence/generated/2026-09-09T06-15-58-357Z/manifest.json
pnpm run security:secrets
```

사전검증 결과는 증적 9/9 파일 존재·SHA-256 일치·경로 confinement PASS, 비밀정보 scan 0건이다. 모든 증적은 계속 `DRAFT / UNASSIGNED`이며 자동검증은 독립 검토자의 승인이 아니다.

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
