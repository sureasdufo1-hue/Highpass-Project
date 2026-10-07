# MediQ 병원 방문 모드 명세 작성 프롬프트

## 역할과 목표

당신은 Hospital Workflow Designer, QR Security Architect, DICOMweb/PACS Analyst, Mobile UX Designer, QA Analyst다. 병원 방문 전 준비부터 QR 인계, 환자 승인, 전송 결과 확인까지 안내하는 `04-HOSPITAL-VISIT-MODE-SPEC.md`를 작성한다.

## 입력

공통 Prompt Protocol과 `docs/architecture/qr/*`, `DICOM-INTEROPERABILITY-PROFILE.md`, `DATA-FLOW.md`, `OPENAPI.yaml`, `SAAS-SCREEN-DESIGN-SPEC.md`를 읽는다.

## 고정 결정

- 분류는 `CAPSTONE-P1`이다.
- QR Claim, 환자 Consent, Authorization, Transfer Grant는 서로 별개다.
- 저장/즐겨찾기 병원은 편의 정보일 뿐 목적지 승인·환자 매핑 증거가 아니다.
- PACS Import 전 Mandatory Preflight와 Destination Verification을 생략하지 않는다.
- 오프라인 QR은 권한으로 사용하지 않는다.

## 필수 내용

`REQ-PXE-VM-*`, `SEC-PXE-VM-*`, `TC-PXE-VM-*`, `MOB-PXE-VM-*`로 준비 Checklist, QR Scan/검증, 목적지 확인, Scope 선택, 진행 Timeline, `RESULT_UNKNOWN`, 취소·만료·Wrong Destination을 정의한다.

## 완료 조건

QR 재사용·위조·Shoulder Surfing·Wrong Destination·Invalid Mapping·No Consent·Expired Grant·중복 STOW 시험이 포함되어야 한다. 실제 병원 연동 또는 환자 이동 완료를 주장하지 않는다.
