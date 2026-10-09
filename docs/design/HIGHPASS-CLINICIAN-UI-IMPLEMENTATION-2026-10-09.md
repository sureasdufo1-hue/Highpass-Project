# 의료진 공통 UI 및 영상 연결 검증

2026-10-09 · **DRAFT / UNASSIGNED** · 독립 검토 미실시

## 목적과 범위

환자 웹과 동일한 공통 토큰을 기존 의료진 HTML/JS 화면에 적용한다. 관련 요구사항은 FR-006~013(목록·의료진 접근), FR-014~025(권한·토큰), FR-026~036(Gateway·Viewer), FR-037~041(감사 경계)이다. 해당 기능군 전체의 완료 판정은 아니다.

`frontend-design` 지침에 따라 기존 구조를 유지하고 첨부 시안의 밝은 블루 목록 화면/어두운 영상 뷰포트를 적용했다. 프레임워크·API·DB 계약은 변경하지 않았다.

## 생성·수정 파일

- 생성: `public/ui/clinician.css`, `test/clinician-ui-preview.test.js`, 이 기록.
- 수정: `public/index.html`, `public/app.js`, `src/orthanc-client.js`, `docs/design/README.md`.
- 기존 미커밋 변경은 보존했다. 해당 파일의 전체 Git diff를 이번 변경으로 간주하지 않는다.

## 구현과 보안 검토

- 공통 색상·버튼·카드·배지·키보드 포커스·44px 조작 크기 적용. 의료진 본문으로 이동 링크를 역할에 맞게 연결.
- 목록 노출을 전송 완료/접근 허용으로 오인시키는 설명과 고정 Token Engine ONLINE 문구 제거.
- Series 항목은 키보드 조작 가능한 버튼으로 전환. 썸네일은 선택된 Series의 승인된 rendered 응답 Blob을 재사용한다. 별도 무인증 썸네일 경로나 정적 예시 영상 대체는 없다.
- Viewer 로딩 전 정적 CT/MRI 예시 이미지를 먼저 표시하던 경로 제거. 조회·prefetch에 10초 timeout 적용.
- 철회/초기화 시 Viewer와 썸네일의 src 제거. 서버 권한 검사, 기존 DPoP 요청 경로 및 토큰 전달 방식 유지.
- 발표용 합성 Secondary Capture DICOM은 8-bit MONOCHROME2인데 기존 로컬 렌더러가 16-bit만 읽어 실패함을 새 테스트에서 재현했다. 8/16-bit와 PixelRepresentation을 구분하고 길이·크기 제한 및 monochrome BMP 행 정렬을 보완했다.
- 이 렌더러는 임상용 범용 DICOM 디코더가 아니다. 압축·다중프레임·전체 전송 구문 적합성 검증은 별도이며, 실제 병원 데이터를 사용하지 않았다.

## 검증 기록

```powershell
node --check public/app.js
node --check src/orthanc-client.js
node --test test/clinician-ui-preview.test.js test/patient-ui-qr.test.js test/consent-operations.test.js test/consent-selection.test.js test/dashboard-polling.test.js test/multislice-viewer.test.js test/synthetic-phantom.test.js
```

| 검증 | 결과 | 범위 |
|---|---|---|
| 선택 회귀 테스트 | PASS | 42개, 0 실패, 종료 코드 0 |
| 합성 CT/MR DICOM 디코딩 | PASS | 기존 phantom 생성기의 실제 DICOM 바이트 → 서로 다른 256×256 BMP 단면; 잘린 PixelData 거부 |
| MR Viewer·썸네일 | PASS | 로컬 기본 시뮬레이터 256×256, 32장 중 1→2 이동 |
| CT Viewer·썸네일 | PASS | 환자 UI 동의 생성 후 의료진 UI 접근; 256×256, 동일 Blob 확인 |
| 철회 후 영상 제거 | PASS | 브라우저에서 Viewer hidden=true, src=null, 표시된 썸네일 0 |
| 반응형 폭 | PASS | 1440px/375px에서 페이지 수평 넘침 없음 |
| VM 발표용 12장 CT·12장 MR E2E | NOT VERIFIED | 위 브라우저 데이터는 기본 시뮬레이터이며 VM PACS 영상 성공으로 대체하지 않음 |
| 실제 Key Vault·mTLS·전체 게이트 | NOT VERIFIED | 이번 실행 범위 밖 |
| 종합 접근성 및 전체 모바일 앱 | NOT VERIFIED | 포커스·버튼 개선을 종합 검증으로 간주하지 않음 |

로컬 브라우저는 기존 격리 개발 환경 `http://127.0.0.1:9461/`을 사용했다. 별도 임시 JSON 저장소의 CT 동의를 생성 후 철회했으며 VM/기존 프로젝트 DB를 변경하지 않았다. 렌더러 수정은 Node 테스트로 검증했고 실행 중인 미리보기 서버에는 재시작 적용하지 않았다. 따라서 브라우저 검증과 새 렌더러 검증은 동일 배포 이미지의 종단 증적이 아니다.

화면 기록: [목록](../../artifacts/ui-review-2026-10-09/clinician-list.jpg), [MR](../../artifacts/ui-review-2026-10-09/clinician-mr.jpg), [CT](../../artifacts/ui-review-2026-10-09/clinician-ct.jpg).

## 남은 작업

1. 통합 이미지에 공통 UI·환자/의료진 파일과 수정된 서버 렌더러를 포함하고 자원 경로·CSP·보안 게이트 확인.
2. VM PACS 발표용 phantom의 환자 소유권·매핑·Study/Series를 승인된 API 흐름으로 연결한 뒤 실제 Key Vault 포함 종단 검증. DB 직접 변경으로 권한을 우회하지 않는다.
3. 모바일 PWA에 공통 디자인을 적용하고 독립 검토. 선택되지 않은 Series 썸네일은 승인된 픽셀을 조회하기 전까지 빈 상태를 유지한다.

배포·커밋·푸시는 수행하지 않았다. 전체 MVP/v3 완료는 선언하지 않는다.
