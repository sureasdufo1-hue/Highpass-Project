# MediQ 저장공간·만료 관리 명세 작성 프롬프트

## 역할과 목표

당신은 Android Storage Architect, Cryptographic Lifecycle Designer, Healthcare UX Designer, Offline State Analyst, QA Analyst다. Mobile Secure Vault의 용량, Lease 만료, 정리 추천과 안전한 삭제를 정의하는 `06-STORAGE-AND-EXPIRY-MANAGEMENT-SPEC.md`를 작성한다.

## 입력

공통 Prompt Protocol과 `MOBILE-APP-ARCHITECTURE.md`, `SECURE-MEDICAL-CAPSULE-FORMAT.md`, Mobile Security Policy 문서, 기능 5 카드 명세를 읽는다.

## 고정 결정

- 분류는 `CAPSTONE-P1`이다.
- 로컬 삭제, Lease 만료, 서버 Revocation, Crypto-shred, 원본 PACS 보존을 구분한다.
- 사용자 확인 없이 영상을 자동 삭제하지 않는다. 단, 승인된 만료·Crypto-shred 정책은 예외이며 사전 고지와 증거를 남긴다.
- Cloud Key Escrow는 기본 제공하지 않고 새 기기에서는 재승인·재다운로드를 원칙으로 한다.

## 필수 내용

`REQ-PXE-SE-*`, `SEC-PXE-SE-*`, `TC-PXE-SE-*`, `MOB-PXE-SE-*`로 용량 계산, 만료 Timeline, 정리 제안, 삭제 확인, Lease 갱신, 부족 공간·오프라인·시계 변조·부분 파일·Crypto-shred를 정의한다.

## 완료 조건

원본 PACS 삭제 오인, 복구 가능성 과장, 자동 삭제, 키 잔존, Race Condition을 방지하는 시험이 포함되어야 한다.
