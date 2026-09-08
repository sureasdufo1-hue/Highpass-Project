# 작업트리 기준선 분류

기준일: 2026-09-07  
Branch: `codex/fix-edge-platform-assets`  
HEAD: `fb1e1a1` (`Fix edge routing for platform assets`)

## 현황

- 추적 파일 수정: 24개
- 미추적 항목: 53개
- 추적 파일 diff: 약 `+694 / -115`
- `git diff --check`: 경고 없음(줄바꿈 CRLF 안내만 표시)
- 현재 변경에는 사용자가 만든 기존 작업이 포함될 수 있으므로 자동 삭제·되돌리기·커밋하지 않음

## 분류

### KEEP-PRODUCT

`src/{auth,http-utils,postgres-store,seed,server,services}.js`, `db/schema.sql`, `package.json`, `public/{index.html,styles.css}`, `docker-compose.yml` 관련 변경, 런타임 보안·인증서 설정 변경은 제품 코드 후보로 유지합니다. 각 변경은 별도 리뷰 후 기존 MVP baseline 커밋으로 묶어야 합니다.

### KEEP-TEST

`test/`, `test/fixtures/`, `scripts/{e2e-integration-test,mvp-verify,security-*,privacy-*,phase1-contract-gate,mtls-negative-check,cert-fixture-check,operations-expiry-check,ops-monitoring-check}.js`와 SQL Gate는 시험·검증 코드로 유지합니다. `node --test`에서 76/76 통과했지만 live Docker 시험은 별도로 표시합니다.

### KEEP-DOCUMENTATION

`docs/`의 요구사항·아키텍처·보안·운영·컴플라이언스·Privacy 문서는 제품 기준선 후보로 유지합니다. 이번 단계에서 추가한 `docs/REQUIREMENTS.md`, `docs/SECURITY.md`, `docs/architecture/ADR-001-requirements-baseline.md`, `THREAT-MODEL.md`, `DATA-FLOW.md`, `docs/traceability/requirements-to-tests.md`도 이 분류입니다.

### REVIEW-REQUIRED

`db/migrations/`, `schemas/`, `docs/api/`, `services/`, `src/privacy-*.js`, `src/privacy-adapter.js`, `src/pseudonym-protection.js`, `src/retention.js`, `config/privacy/`는 Mobile-Core·Privacy 계약 또는 운영 경계를 변경할 수 있으므로 기준선 승인과 보안 리뷰 전에는 적용·배포하지 않습니다.

### MOVE-TO-EVIDENCE

`evidence/generated/`의 생성 증적, 실행 결과 텍스트, `artifacts/` 산출물은 제품 커밋과 분리합니다. 증적은 생성 당시 SHA·실행시각·환경·검토자 상태가 연결된 경우에만 릴리스 자료로 사용합니다. 현재 저장된 2026-08-26 증적은 최신 작업트리 전체를 대표하지 않습니다.

### REVIEW-REQUIRED: 임시·대형 산출물

`tmp/`, `tmp_doc_work/`, `tmp_diagram_work/`, `모바일분석_*.docx`는 제품 코드가 아닙니다. 보존 필요성·재생성 가능성·민감정보 포함 여부를 확인한 뒤 별도 보관 또는 삭제를 사용자가 승인해야 합니다. 이 단계에서는 변경하지 않습니다.

### DANGEROUS-OR-SENSITIVE 점검

- `.env`는 Git 추적 목록에 없으며 내용은 출력하지 않았습니다.
- Secret scan은 findings 0입니다.
- 인증서·개인키·토큰·실제 PHI를 커밋하지 않습니다.
- 위 분류만으로 파일 삭제나 커밋을 승인한 것으로 간주하지 않습니다.

## 제안 커밋 경계

1. 문서 기준선·ADR·추적성
2. 기존 MVP 제품 코드
3. 인증·토큰·감사·인증서 보안 변경
4. 테스트·검증 게이트
5. Mobile-Core 계약·설계(승인 후)
6. Mobile-Core 실행 구현(계약·DB Gate 후)

각 커밋은 별도 리뷰하고 Push/Merge는 명시적 승인을 받은 뒤 수행합니다.
