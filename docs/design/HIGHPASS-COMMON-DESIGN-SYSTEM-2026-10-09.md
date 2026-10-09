# Highpass 공통 디자인 시스템 명세

- 버전: 0.1 / 2026-10-09 / DRAFT / UNASSIGNED
- 적용 대상: 환자 웹·의료진 웹·모바일 웹/PWA. **명세 작성이며 실제 CSS 적용·화면 테스트 완료가 아니다.**
- 기존 [SaaS 디자인 시스템](SAAS-UI-DESIGN-SYSTEM.md)의 보안 상태·컴포넌트 계약은 보존한다. 본 문서는 사용자 제공 세 시안과 현행 vanilla HTML/CSS/JS 구현을 정렬하는 보완안이다. 기존 React/Android 목표는 현재 스택의 변경 승인으로 해석하지 않는다.
- 연결: [화면·기능 매핑표](HIGHPASS-THREE-SCREEN-FUNCTION-MAPPING-2026-10-09.md)

## 1. 방향과 비목표

밝은 의료용 블루, 짙은 네이비 제목, 흰 카드, 얇은 경계, 여유 있는 한글 본문을 공통 언어로 사용한다. 환자는 이해와 행동 중심, 의료진은 검증 근거와 목록 중심, 모바일은 한 작업씩 진행한다. Viewer 픽셀 영역만 dark surface를 사용한다.

첨부 PNG의 글자 크기·고정 수치·의료영상·기기 보안 주장을 그대로 옮기지 않는다. 로고는 별도 승인 전 Highpass 유지. 디자인만으로 법률·인증·기기 안전·임상 정확성을 보장하지 않는다. 이번 단계에는 프레임워크 변경, 새 AI 서비스, 모바일 네이티브 전환, 대규모 backend 변경이 없다.

`design-system` 스킬의 primitive→semantic→component 구조를 적용한다. `ui-ux-pro-max` 로컬 검색의 재조회에서 minimal dashboard 스타일을 참고했다. 자동 추천의 marketing hero/CTA, 영문 Fira font, GSAP 의존성은 업무 화면·한글·기존 스택에 부적합해 채택하지 않는다. 아래 팔레트는 시안 방향에 맞춘 **제안값**이며 픽셀 색상 추출값이 아니다.

## 2. 토큰 계약

구현 예정 경로는 `public/ui/tokens.css`, `public/ui/components.css`다. 아직 파일을 생성하지 않았다. namespace는 `--hp-*`; 컴포넌트는 raw hex 대신 semantic/component token을 사용한다.

### 2.1 색상: primitive → semantic

| Primitive 제안값 | Semantic token | 용도 |
|---|---|---|
| blue-600 `#2563EB` | `--hp-color-primary` | 기본 주요 버튼·링크 |
| blue-700 `#1D4ED8` | `--hp-color-primary-hover`, `--hp-color-focus` | hover·명시적 포커스 |
| blue-800 `#1E40AF` | `--hp-color-primary-active` | pressed |
| blue-50 `#EFF6FF` | `--hp-color-selected` | 선택 영역; 파란 글자와 조합 |
| slate-50 `#F8FAFC` | `--hp-color-canvas` | 페이지 배경 |
| white `#FFFFFF` | `--hp-color-surface`, `--hp-color-on-primary` | 카드·버튼 글자 |
| slate-900 `#0F172A` | `--hp-color-text` | 제목·본문 |
| slate-600 `#475569` | `--hp-color-text-muted` | 보조 설명 |
| slate-200 `#E2E8F0` | `--hp-color-border-subtle` | 장식용 카드 경계; 입력 식별 경계 대체 금지 |
| slate-500 `#64748B` | `--hp-color-border-control` | 입력·필수 구획 경계 |
| emerald-800 `#065F46` / emerald-50 `#ECFDF5` | `--hp-color-success` / `--hp-color-success-bg` | 검증된 허용·성공 |
| amber-800 `#92400E` / amber-50 `#FFFBEB` | `--hp-color-warning` / `--hp-color-warning-bg` | 만료 임박·확인 필요 |
| red-800 `#991B1B` / red-50 `#FEF2F2` | `--hp-color-danger` / `--hp-color-danger-bg` | 거부·오류 |
| violet-800 `#5B21B6` / violet-50 `#F5F3FF` | `--hp-color-unknown` / `--hp-color-unknown-bg` | 미검증·미연결; 보라색 주 테마는 아님 |
| near-black `#05080C` / slate-100 `#F1F5F9` | `--hp-color-viewer-canvas` / `--hp-color-viewer-text` | Viewer dark 영역 |

일반 본문·버튼 글자 대비 목표 4.5:1, 필수 제어 경계·포커스 목표 3:1. 실제 조합·hover·선택·dark 상태를 별도 계산·브라우저 확인한다. 장식 경계가 약해도 입력 경계까지 같은 색상으로 바꾸지 않는다. disabled 이유 설명은 읽을 수 있는 대비를 유지한다. 이 목표는 전체 접근성 인증 판정이 아니다.

### 2.2 글꼴·간격·형태

| 토큰군 | 규격 |
|---|---|
| font-family | `"Malgun Gothic", "Apple SD Gothic Neo", "Noto Sans KR", system-ui, sans-serif`; 설치된 폰트 사용, CDN 의존 금지 |
| type-page | PC 28/36px 700, 모바일 24/32px 700 |
| type-section / card | 20/28px 700 / 18/26px 600 |
| type-body / control | 16/24px 400 / 16/24px 600 |
| type-table / label | 14/20px 400 / 14/20px 600 |
| type-caption | 12/18px; 합성 표시·만료·거부·권한 등 핵심 판단에는 사용하지 않음 |
| space | 4, 8, 12, 16, 24, 32, 48, 64px; 8px 기본 grid, 4px 보조 정렬 |
| radius | control 8px, card 12px, dialog 16px, badge pill |
| border / shadow | 1px border; 카드 `0 2px 8px rgb(15 23 42 / 0.04)`, modal `0 12px 32px rgb(15 23 42 / 0.16)` |
| motion | hover 120ms, panel 180ms; reduced-motion에서는 비필수 이동/전환 제거 |

숫자·시각은 tabular-nums, 긴 한글은 자연스러운 줄바꿈. 표/버튼 label을 억지 한 줄로 잘라 의미를 숨기지 않는다. 별도 폰트 도입은 파일 확보·라이선스·한글 glyph·오프라인 로드 검증 후 수행한다.

### 2.3 component token 예시

```css
/* 구현 명세 예시이며 runtime에 아직 적용하지 않았다. */
--hp-button-primary-bg: var(--hp-color-primary);
--hp-button-primary-fg: var(--hp-color-on-primary);
--hp-button-primary-bg-hover: var(--hp-color-primary-hover);
--hp-card-bg: var(--hp-color-surface);
--hp-card-border: var(--hp-color-border-subtle);
--hp-input-border: var(--hp-color-border-control);
--hp-focus-ring: var(--hp-color-focus);
```

## 3. 역할별 shell·반응형

| 화면 | 넓은 화면 | 좁은 화면 |
|---|---|---|
| 환자 웹 | header 64px, sidebar 224px, 본문 summary→승인/동의→영상/상태→안내 | sidebar drawer; 카드 1열; 핵심 행동을 먼저 표시 |
| 의료진 웹 | sidebar 224px, 중앙 목록·Viewer, 상세 rail 320px (≥1440px) | 1024~1439px rail은 drawer/아래; 768~1023px 메뉴 drawer; <768px 목록→상세 순차 탐색 |
| 모바일 PWA | PC 미리보기에서만 최대 폭 480px 중앙 정렬 가능 | 320~767px 실제 viewport 전체 사용; 고정 890px phone frame 금지 |

page gutter는 PC 24px, tablet 20px, mobile 16px. summary는 공간에 따라 4→2→1열. 환자/의료진의 검색·목록·상세는 다른 화면이지만 동일 typography·버튼·상태 컴포넌트를 쓴다.

환경 배지는 header의 문서 흐름에 포함한다. 하단 fixed overlay로 메뉴·포커스·Viewer를 가리지 않는다. 모바일 bottom nav 최소 64px + `env(safe-area-inset-bottom)`; 본문은 nav 높이만큼 여백을 둔다. 기본 page scroll은 하나; modal·Viewer만 제한된 내부 scroll을 허용한다. 화면 확대를 금지하는 `user-scalable=no`/`maximum-scale=1`은 제거 대상이다.

## 4. 공통 컴포넌트 계약

| 컴포넌트 | 규격·상태 | 필수 동작/데이터 규칙 |
|---|---|---|
| EnvironmentBanner | 합성 데이터·캡스톤 비운영 표시, 줄바꿈 허용 | 모든 보호 화면에 유지; 법률·운영 PASS 배지 금지 |
| VerifiedContextHeader | 사용자 유형·가상 병원·본인 표시 | 서버 context에 연결; 화면 탭이 principal 변경을 의미하지 않음 |
| Button | primary/secondary/outline/ghost/danger; 기본 44px, 주요 48px; 아이콘 영역 44×44px | default/hover/pressed/focus/loading/disabled. 44px는 프로젝트 사용성 기준; disabled 이유를 인접 text로 제공. 1개 주요 CTA |
| FormControl | visible label, 기본 높이 44px, error/help 영역 | placeholder만 label로 사용 금지; 필드별 오류와 error summary; 제출 중 중복 실행 차단 |
| SummaryCard | label·count·확인 시각·진입 action | 조회 실패≠0건. 데이터 없다면 skeleton→확인 필요; 동의와 QR 집계 분리 |
| ConsentCard | 기관·목적·범위·작업·기간·상태·허용 행동 | VIEW/DOWNLOAD/PACS_IMPORT 독립. 새 scope 동의를 기존 승인으로 간주하지 않음 |
| StudyCard / StudyTable | 실제 modality/검사일/원본 병원/합성 표시 | 권한 없는 metadata 미노출; 전체 Study 자동 다운로드 금지 |
| StatusBadge | icon+label, tooltip/설명, 14px 중요 상태 | 도메인별 canonical state와 서버 확인시각; badge 색상으로 CTA 결정 금지 |
| TransferTimeline | 확인됨/진행/대기/실패/미검증 구분 | event 증거 없으면 tick·percent·ETA 생성 금지. 전송≠수신 검증≠완료 |
| ViewerToolbar | 이름 있는 버튼·선택 상태·만료 안내 | 실제 frame 수·허용 scope만 사용; 거부/만료 후 새 요청 차단 및 표시 pixel 정리. 즉시 외부 저장본 회수 주장 금지 |
| QRPanel | TTL·기관·scope·terminal 이유 표시 | 사용/철회/만료 시 QR 제거, countdown/polling 정리; 비밀값 텍스트·로그·주소 복사 금지 |
| ReceiptList / AuditTable | 본인 최소 이력 / 관리자 scoped audit 별도 | 기존 클라이언트 raw audit 필터를 서버 권한 경계로 착각하지 않음; 추정 actor·hash chain 성공 금지 |
| Dialog / Drawer | PC max512px, 모바일 viewport-32px, 접근 가능한 title | 열 때 focus 이동·trap, 닫을 때 원래 버튼 복원. 철회/파기는 영향 설명·취소 기본; native confirm 중첩 금지 |
| Empty / Error / Unsupported | loading·empty·denied·expired·network·not-supported 각각 | 재시도 가능한 오류만 retry; stack·키·token·인증서 경로 숨김; 안전한 correlation reference만 표시 |

아이콘은 통일된 로컬 SVG, 기본 20px, `currentColor` 사용. 장식 아이콘은 aria-hidden, 아이콘 버튼은 accessible name을 둔다. 새 아이콘 패키지는 필요·라이선스·번들·오프라인성을 확인한 후 도입한다. 일러스트는 역할 안내용으로만 사용하고 버튼·표·환자 영상 전체를 이미지로 구현하지 않는다.

## 5. 서버 상태와 화면 상태를 분리

| 영역 / 서버 또는 관찰 상태 | 표시 | CTA 규칙 |
|---|---|---|
| legacy Consent ACTIVE | 동의 유효 | 인증·action·scope·기한 검증은 별도 |
| legacy REVOKED / v3 WITHDRAWN | 동의 철회됨 | 발급·QR·조회 차단; alias는 표시만 공유, DB enum 변경 금지 |
| Consent EXPIRED / PENDING / REJECTED | 만료됨 / 승인 대기 / 승인 거절 | 각각 구분; 승인 대기에서도 정책이 허용하는 본인 취소/철회는 별도 판단 |
| policy ALLOWED/DENIED 또는 ALLOW/DENY | 허용됨 / 허용되지 않음 | 응답 adapter에서 판별, 서로 다른 계약을 임의 통합하지 않음 |
| Ticket consumed/revoked/expired | 사용됨 / 철회됨 / 만료됨 | 실제 응답의 enum을 adapter에서 정확히 대응; consent ACTIVE와 QR 사용 가능 분리 |
| Gateway ONLINE/OFFLINE/DEGRADED | 연결됨 / 연결 불가 / 일부 제한 | stale health는 마지막 확인시각 + 재확인 필요 |
| UI loading / empty | 확인 중 / 내역 없음 | empty는 성공 응답에서만 |
| UI NETWORK_ERROR / RESULT_UNKNOWN | 연결 실패 / 결과 확인 필요 | DENY나 PASS로 기록하지 않음; unknown mutation은 조회 확인 후 재시도 |
| capability NOT VERIFIED / NOT CONNECTED | 미검증 / 미연결 | 성공 CTA 미제공; 범위 밖 기능은 안내만 |

동의 만료, token 만료, QR 만료, offline lease는 별도 시계다. 한 countdown을 다른 기한으로 재사용하지 않는다. 서버 절대 만료시각과 표시용 countdown을 분리하고 countdown만으로 권한을 승인하지 않는다.

## 6. 데이터·보안·통신

- 기존 인증 wrapper와 DPoP 발급·검증 경로를 유지한다. 새로운 `fetch`가 이를 우회하지 않도록 공통 adapter로 연결한다.
- client timeout은 read 10초를 기본 제안으로 삼되 기존 영상 전송의 명시적 deadline을 임의 단축하지 않는다. 모든 요청·polling은 유한 timeout, 중복 방지, 화면 이탈 시 abort/정리를 가진다.
- QR 상태는 현행 5초 polling/10초 request timeout을 보존하고 terminal/로그아웃/이탈 때 종료한다. 정책 DENY를 자동 재시도로 덮지 않는다.
- API metadata·DICOM·pixel·token·QR capability·key는 localStorage/일반 캐시/URL query/디버그 패널에 저장하지 않는다. QR capability는 승인된 기존 handoff 규격만 유지하며, 일반 access token의 URL 전달은 금지한다.
- Service Worker의 정적 shell allowlist를 보존한다. API 캐시를 추가해 오프라인 Viewer를 구현하지 않는다.
- 동적 text는 textContent 또는 기존 검증 escaping 사용; DOM 삽입은 신뢰하지 않는 HTML과 분리한다. UI에는 내부 경로·stack·실제 secret 없음.
- 역할·환자·기관 전환/로그아웃/철회/만료 때 stale 목록·Viewer pixel·QR·timer를 정리한다. 복구 시 cache의 이전 성공을 현재 허용으로 사용하지 않는다.

## 7. 접근성·시각 수용 기준

| 기준 ID | 구현 후 검증 |
|---|---|
| DS-AC-01 | 320/375/390/768/1024/1440/1672px에서 핵심 작업 가능. 전체 페이지 가로 overflow 없음; 표의 제한 scroll은 label과 keyboard 지원 |
| DS-AC-02 | 200% zoom, 한글 줄바꿈, 긴 병원명·Study 설명에서 정보/CTA 유실 없음 |
| DS-AC-03 | 키보드만으로 메뉴→동의→QR→Viewer→닫기 가능; skip link, focus-visible 2px+2px offset; 배지/nav가 focus 가리지 않음 |
| DS-AC-04 | dialog 종료·auth unlock 후 숨긴 영역은 hidden/inert 등으로 실제 비활성; opacity만으로 숨기지 않음 |
| DS-AC-05 | selected nav aria-current 또는 tab aria-selected, live 결과는 role=status; countdown 매초 반복 낭독 금지 |
| DS-AC-06 | 토큰·QR·동의 만료·철회·거부·network 실패·빈 결과·미지원 각각 재현; 가짜 녹색 성공과 보호 CTA 없음 |
| DS-AC-07 | 최종 색상쌍 대비 계산, 브라우저 focus/forced-colors/reduced-motion 확인; 자동 계산만으로 접근성 전체 PASS 선언 금지 |
| DS-AC-08 | 첨부 시안과 동일 viewport에서 screenshot 비교. mock fixture와 실 API 캡처를 분리하고 민감값 마스킹; 신규 증적 DRAFT / UNASSIGNED |

## 8. 구현 handoff와 범위

다음 구현에서는 우선 공통 토큰/컴포넌트와 환자 웹을 작업한다. 기존 기능 DOM ID·이벤트 binding을 유지하거나 명시적 대응표로 이전한다. 모바일 메뉴 변경은 기록/공유 기능의 대체 진입점과 뒤로 가기를 확인한 뒤 적용한다. 큰 rewrite 대신 역할별 shell/컴포넌트를 순차 교체한다.

관련 요구사항: FR-001~041 기능군, FR-MOBILE-012, V3-NFR-UX-001, V3-NFR-REL-001/002, V3-NFR-PERF-001, V3-NFR-OBS-001. 해당 요구사항 전체 구현 완료를 뜻하지 않는다.

현재 검증 결과: 문서 정합성·경로 검사는 별도 실행 기록으로 보고한다. runtime/브라우저/전체 보안 회귀는 **NOT VERIFIED**. 기존 배포나 사람 승인을 새 명세 승인으로 승계하지 않는다. native 금고·생체인증·offline DICOM·신규 v3 Grant·PACS 수신 검증은 본 디자인만으로 완료하지 않는다.

## 9. 작성 시 검증 기록 (DRAFT / UNASSIGNED)

2026-10-09, 로컬 문서 작성 환경에서 수행했다. 사람이 독립 승인한 결과가 아니다.

| 검사 | 결과 | 근거·범위 |
|---|---|---|
| 문서 링크·기존 소스/테스트 경로·매핑 ID 중복 검사 | PASS | PowerShell 정적 검사, exit 0; UI-P 9 + UI-H 8 + UI-M 11 = 28개 고유 매핑. 명시적으로 제안한 미생성 CSS 2개는 기존 파일 검사에서 제외 |
| 변경 README whitespace 검사 | PASS | `git diff --check -- docs/design/README.md`, exit 0; CRLF 정규화 안내는 오류 아님 |
| 아래 7개 foreground/background의 상대 휘도 대비 계산 | PASS | Node 계산 exit 0; sRGB 선형화→상대 휘도 비율, 모두 일반 text 목표 4.5:1 이상 |
| 실제 렌더링·hover/disabled/forced-colors·화면 접근성 | NOT VERIFIED | 새 디자인 코드 미적용; 계산 결과가 전체 접근성 PASS를 뜻하지 않음 |
| API·Node 회귀·발표 환경 전체 E2E | NOT VERIFIED | 이번 문서 작성에서 실행하지 않음 |

| 조합 | 대비 |
|---|---:|
| primary `#2563EB` / white | 5.17:1 |
| hover/focus `#1D4ED8` / white | 6.70:1 |
| muted text `#475569` / white | 7.58:1 |
| success `#065F46` / `#ECFDF5` | 7.29:1 |
| warning `#92400E` / `#FFFBEB` | 6.84:1 |
| danger `#991B1B` / `#FEF2F2` | 7.60:1 |
| unknown `#5B21B6` / `#F5F3FF` | 8.19:1 |
