# MediQ External LLM Question Pack Specification

**Document ID:** `MEDIQ-AIQ-001`  
**Ticket:** `MEDIQ-AIQ-001`  
**Version:** v1.1 — Synthetic Local RAG Relationship  
**Classification:** `CAPSTONE-P1 SYNTHETIC PROTOTYPE`; real-data export is `PRODUCTIONIZATION`  
**Status:** Approved Safety Baseline — Synthetic HTML Prototype Only / No External LLM Integration  
**Date:** 2026-09-26

## 1. 결정

MediQ는 환자가 검사결과를 외부 LLM에 질문하기 쉽게 `AI 질문용 자료 만들기` 기능을 제공할 수 있다. 그러나 현재 MVP는 합성 데이터만 사용하고, MediQ가 외부 LLM을 호출·업로드·자동 실행하지 않는다.

`docs/ai/`의 합성 환자 설명·질문 준비 RAG는 본 기능과 별도다. RAG는 MediQ 안에서 Local Approved Knowledge Pack을 검색해 비진단 설명을 만들며, 본 문서는 사용자가 MediQ 밖의 외부 AI에 질문할 Text를 준비하는 흐름을 정의한다. 두 흐름 모두 실제 환자자료와 외부 자동전송을 허용하지 않는다.

```text
CAPSTONE-P1
= Synthetic Record 선택
+ On-device 최소화/가림 시뮬레이션
+ 질문용 Text Preview
+ 사용자 검토
+ Local Clipboard 복사
+ No external network / No provider deep link

PRODUCTIONIZATION
= Real health data
+ 명시적 민감정보 제3자 제공 판단
+ 외부 LLM Provider 정책·보존·학습·국외이전 검토
+ 법률·개인정보·보안 승인
+ 강한 재인증·감사·철회/삭제 안내
```

## 2. 제품 명칭과 금지 표현

허용 명칭:

- `AI 질문용 자료 만들기`
- `식별정보를 줄인 질문 텍스트`
- `외부 AI에 붙여넣기 전 확인`

금지 명칭:

- `AI 진단`
- `AI 판독`
- `안전하게 익명화 완료`
- `개인정보가 절대 전송되지 않음` — 사용자가 이후 외부 서비스에 붙여넣을 수 있으므로 금지
- `의료진과 같은 해석`

## 3. 사용자 흐름

```text
합성 검사 Record 선택
→ AI 질문용 자료 만들기
→ 포함 항목 선택
→ 기본 식별정보 제거
→ 질문 Text Preview
→ 외부 AI 위험·비진단 고지 확인
→ Clipboard 복사
→ MediQ 화면 종료

외부 LLM 열기/붙여넣기/전송
= 사용자가 MediQ 밖에서 별도로 수행
```

MediQ는 외부 서비스 URL에 Prompt를 Query String으로 넣거나, App-to-App 자동 Paste·전송·업로드를 수행하지 않는다.

## 4. 기본 포함·제외 필드

### 기본 포함 가능

- 합성 검사명과 코드
- 합성 결과값·단위
- 합성 제공기관 참고범위와 원문 판정
- 월 단위 검사시점 또는 합성 날짜
- 사용자가 선택한 일반 질문
- `의료진 진단을 대체하지 않음` 고지

### 기본 제외

- 이름, 생년월일, 성별, 연락처
- Patient ID, Hospital-local ID, 주민등록번호
- 실제 병원명·의료진명·주소
- Accession Number, DICOM UID, Receipt/Grant/Session ID
- 원본 PDF·DICOM·임상 Free Text
- 얼굴·신체 사진, 영상 Pixel Data
- 정확한 진료시각과 위치

제외 후에도 희귀 검사·날짜 조합 등으로 재식별될 수 있으므로 `익명화 완료`라고 표현하지 않는다.

## 5. 질문 Template

```text
[합성 데이터 시연 / 실제 의료기록 아님]

검사: B형간염 표면항체 검사
결과: 128.4 mIU/mL
제공기관 참고범위: 10 이상
제공기관 원문 판정: 반응성

질문:
1. 이 검사에서 일반적으로 확인하는 내용은 무엇인가요?
2. 결과를 의료진과 상담할 때 어떤 질문을 준비하면 좋을까요?
3. 검사법이나 단위에 따라 해석이 달라질 수 있는 부분은 무엇인가요?

주의: 외부 AI의 답변은 부정확할 수 있으며 진단·치료 결정을 대신하지 않습니다.
```

질문 Template은 설명·상담 준비를 중심으로 하며 “내가 어떤 질병인지 진단해줘”, “약을 중단해도 되는지 알려줘” 같은 고위험 Prompt를 기본 생성하지 않는다.

## 6. Capture·Copy 정책

| 기능 | Synthetic MVP | 실제 데이터 Production |
|---|---|---|
| Text Preview | 허용 | Gate 후 검토 가능 |
| Clipboard Copy | 합성 데이터만 허용 | 기본 비활성, 법률·보안 승인 필요 |
| Image Card Capture | 합성 Watermark에 한해 허용 가능 | 기본 금지 |
| 원본 화면 Screenshot | OS 정책 유지 | 금지 또는 별도 강한 승인 필요 |
| 외부 LLM 자동 열기 | 금지 | 기본 금지 |
| 외부 LLM API 전송 | 없음 | Provider별 별도 Integration Gate |
| 답변을 의료기록에 저장 | 금지 | 별도 임상 Governance 없이는 금지 |

Clipboard는 다른 앱이 접근할 수 있고 사용자가 붙여넣으면 제3자 전송이 발생할 수 있다. 복사 직전에 이 사실과 외부 서비스의 학습 활용·대화 저장·삭제 설정 확인 필요를 안내한다.

## 7. 기능 요구사항

| ID | 요구사항 |
|---|---|
| `REQ-AIQ-001` | Capstone 기능은 `sourceMode=SYNTHETIC`, `providerMode=MOCK`, `TEST-*` Record만 받아야 한다. |
| `REQ-AIQ-002` | 기본 질문 자료는 Allowlist 필드만 포함하고 식별자·기관명·UID·원본 문서를 제외해야 한다. |
| `REQ-AIQ-003` | 사용자는 복사 전 최종 Text와 포함 항목을 검토할 수 있어야 한다. |
| `REQ-AIQ-004` | 외부 서비스로 자동 전송·자동 Paste·Provider Deep Link를 제공하지 않아야 한다. |
| `REQ-AIQ-005` | 질문 Template은 설명·상담 준비 중심이며 진단·처방·투약 변경을 요청하지 않아야 한다. |
| `REQ-AIQ-006` | 복사 전 외부 AI의 저장·학습·국외처리·오답 가능성과 의료진 상담 필요성을 안내해야 한다. |
| `REQ-AIQ-007` | 외부 LLM 답변을 Consent, Authorization, 의료기록, 검사 판정 또는 PACS Workflow에 사용할 수 없어야 한다. |
| `REQ-AIQ-008` | 실제 데이터 모드에서는 Production Gate 미충족 시 기능을 Fail Closed해야 한다. |

## 8. 보안·개인정보 요구사항

| ID | 요구사항 |
|---|---|
| `SEC-AIQ-001` | 질문 자료 생성은 기본적으로 On-device에서 수행하고 서버에 새 사본을 저장하지 않아야 한다. |
| `SEC-AIQ-002` | Clipboard 복사 Event에는 내용이 아닌 Record Type·Synthetic 여부·Outcome만 기록해야 한다. |
| `SEC-AIQ-003` | 질문 Text를 Analytics, Crash Report, URL, Notification 또는 일반 로그에 포함하지 않아야 한다. |
| `SEC-AIQ-004` | Capture 이미지에는 `SYNTHETIC DEMO / AI 질문용 / 진단 아님` Watermark를 제거 불가능하게 합성해야 한다. |
| `SEC-AIQ-005` | 실제 데이터의 Copy/Capture는 법적 근거·제3자 제공·국외이전·Provider 보존/학습정책 검토 전 비활성화해야 한다. |
| `SEC-AIQ-006` | LLM 응답은 신뢰된 의료정보나 서버 권위 상태로 재수입하지 않아야 한다. |
| `SEC-AIQ-007` | Background 전환 시 질문 Preview를 차폐하고 취소·완료 후 임시 Buffer를 지워야 한다. |

## 9. 위협과 통제

| 위협 | 통제 |
|---|---|
| 식별자 포함 Prompt 유출 | Allowlist, 기본 가림, 사용자 Preview |
| Clipboard를 통한 다른 앱 노출 | 합성 MVP 제한, 복사 직전 경고, 자동전송 없음 |
| 외부 LLM 학습·장기 보존 | Provider 설정 확인 안내, 실제 연동 Gate |
| 오답을 진단으로 신뢰 | 비진단 고지, 상담 준비형 Prompt, 응답 재수입 금지 |
| Screenshot에 숨은 PHI | 원본 Capture 금지, 합성 Watermark Card만 허용 |
| Deep Link Query에 민감정보 | Provider Deep Link와 URL Parameter 금지 |
| 재식별 | 익명화 주장 금지, 희귀 조합 제거 권고 |

## 10. Acceptance

| ID | 시나리오 | 예상 결과 |
|---|---|---|
| `TC-AIQ-001` | 합성 항체검사 질문자료 | 허용 필드·합성 고지·상담 질문 생성 |
| `TC-AIQ-002` | 이름·Patient ID가 있는 입력 | Preview에서 제거, 복사 Payload 미포함 |
| `TC-AIQ-003` | 실제 Record Marker | Fail Closed, Copy/Capture 비활성 |
| `TC-AIQ-004` | 복사 직전 | Clipboard·외부 서비스 저장/학습·오답 경고 표시 |
| `TC-AIQ-005` | 외부 네트워크 관찰 | LLM Provider 호출·Deep Link 없음 |
| `TC-AIQ-006` | Capture 시도 | 합성 Card만 Watermark와 함께 허용 |
| `TC-AIQ-007` | 진단·약 변경 질문 자동생성 여부 | 기본 Template에 없음 |
| `TC-AIQ-008` | LLM 답변 Import 시도 | 의료기록·판정·Grant로 저장 불가 |

모든 기능 Test는 `NOT RUN`이다.

## 11. 구현 단계

1. Synthetic HTML에서 Select → Redact Preview → Copy 시연
2. Android Local Prototype과 Clipboard 경고·Background 차폐
3. 법률·개인정보 영향평가와 Provider Processing Matrix
4. 필요 시 승인된 Provider Connector를 별도 Ticket으로 검토

단계 3 이전에는 실제 건강정보 Copy/Capture 기능을 활성화하지 않는다.

## 12. 정책 참고

- 개인정보보호위원회는 생성형 AI에 사용자가 입력한 텍스트·음성·첨부파일과 생성 결과물의 수집·저장을 개인정보 처리방침에 구체화하고 민감정보 입력 주의를 안내하도록 제시한다. [2026 개인정보 처리방침 작성지침 개정](https://pipc.go.kr/np/cop/bbs/selectBoardArticle.do?bbsId=BS074&nttId=12021)
- 이용자는 외부 생성형 AI의 학습 활용 여부, 대화기록 저장·삭제와 Opt-out 설정을 직접 확인·통제할 필요가 있다. [생성형 AI 서비스 이용자 개인정보 보호 가이드](https://pipc.go.kr/np/cop/bbs/selectBoardArticle.do?bbsId=BS074&mCode=&nttId=12084)
- 생성형 AI 개발·활용에는 생애주기별 법적 근거와 안전조치를 검토해야 한다. [생성형 AI 개인정보 처리 안내서](https://pipc.go.kr/np/cop/bbs/selectBoardArticle.do?bbsId=BS074&mCode=C020010000%22&nttId=11410)

## 13. 완료 경계

현재 승인 범위는 합성 데이터용 질문 Text 작성·Preview·Local Copy 시연이다. 실제 건강정보, 외부 LLM API, Provider 선택, 자동전송, 답변 저장과 의료적 해석은 구현·승인되지 않았다.
