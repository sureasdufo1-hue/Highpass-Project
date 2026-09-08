# PHR-W03 HealthDataProvider 실행 보고서

상태: `CODE COMPLETE / UNIT VERIFIED / API NOT CONNECTED`  
실행일: 2026-09-08  
승인 기준: PHR-JA-001/002 공동승인  
관련 요구사항: PHR-FR-001~008, PHR-FR-018, PHR-NFR-001~003

## 작업 목적

DB와 기존 API를 변경하지 않고 HealthDataProvider 논리계약, 오프라인 Synthetic FHIR R4 Provider, 비활성 MyHealthWay Provider를 구현한다.

## 생성 파일

- `src/health-data-provider.js`
- `test/health-data-provider.test.js`

## 구현 내용

- `HealthDataProvider` 기본 계약과 typed `PhrProviderError`
- `SyntheticFhirProvider`
  - 시작 시 manifest와 fixture SHA-256 검증
  - `principalSubject + patientRef + providerId` binding 검증
  - Patient와 6개 목록 리소스 조회
  - FHIR R4/합성/출처/조회시점/correlation metadata
  - 기본 20·최대 50 pagination
  - patient/resource/filter/limit에 HMAC 바인딩된 opaque cursor
  - 허용 query `cursor`, `limit`, `from`, `to`, `status`만 수용
  - 최대 조회기간 5년 및 잘못된 범위 fail-closed
- `MyHealthWayProvider`
  - capabilities는 `NOT_CONFIGURED`
  - 모든 조회는 503 `PHR_PROVIDER_NOT_CONFIGURED`
  - endpoint·credential·외부 network 구현 없음

## 보안 검토

- 요청 patientId를 받지 않고 서버 context binding을 요구한다.
- A 계정으로 B patientRef를 요청하면 403이다.
- cursor에는 환자·계정 문자열이 없으며 서명된 binding이 달라지면 재사용할 수 없다.
- 변조된 fixture는 Provider 생성 단계에서 거부한다.
- 예상하지 않은 query field와 과대 limit/date range는 거부한다.
- Provider 응답은 fixture의 clone이며 내부 binding registry를 반환하지 않는다.
- MyHealthWay adapter는 외부 호출 경로 자체를 갖지 않는다.

## 테스트 결과

| 테스트 | 결과 | 근거 |
|---|---|---|
| offline R4 capabilities | PASS | `externalNetworkRequired=false`, 지원 리소스 확인 |
| 환자 A/B 격리·공통 metadata | PASS | 양방향 record 조회와 교차 문자열 0건 |
| 누락 context·타환자 binding | PASS | 401/403 typed error |
| pagination·cursor 변조/재사용 | PASS | patient/filter/limit 변경 거부 |
| limit·query allowlist·5년 범위 | PASS | 413/422 typed error |
| fixture checksum 변조 | PASS | 시작 단계 500 fail-closed |
| MyHealthWay 미설정·외부호출 금지 | PASS | 503, fetch 호출 0건 |
| Provider 전용 + W02 계약 suite | PASS | 11/11 |
| HTTP PHR API | NOT RUN | PHR-W04 범위 |
| 감사로그 | NOT RUN | PHR-W04 범위 |
| 실제 MyHealthWay | NOT VERIFIED | 후속·공식 승인 필요 |

## API 영향

기존 API 변경 없음. `/api/v1/me/phr/*` 라우트와 RFC 7807 오류 변환은 PHR-W04에서 연결한다. DB migration은 생성하지 않았다.

## 남은 위험 및 다음 작업

- default fixture 경로는 합성 로컬 PoC 전용이다. 운영모드에서는 Synthetic Provider 허용 여부를 명시적으로 차단해야 한다.
- Provider가 반환한 FHIR resource를 PHR 조회모델로 정규화하는 경계는 PHR-W04에서 추가 검증해야 한다.
- 감사 이벤트·UID 노출 정책은 PHR-JA-003/004 승인 전 구현계약으로 확정할 수 없다.

다음 작업은 `PHR-W04 — /api/v1/me/phr 환자 binding API와 감사 연결`이며 PHR-JA-003/004 공동승인을 선행조건으로 한다.
