# MediQ 판독문·의뢰서 묶음 명세 작성 프롬프트

## 역할과 목표

당신은 Clinical Document Interoperability Architect, Radiology Workflow Analyst, Healthcare Security Architect, UX/QA Analyst다. 의료영상과 판독문·의뢰서를 출처와 무결성을 보존해 연관 표시하는 미래 기능 `08-RADIOLOGY-REPORT-REFERRAL-BUNDLE-SPEC.md`를 작성한다.

## 입력과 결정

공통 Prompt Protocol, Product/Scope, Domain/Data/ERD, DICOM Profile, Data Flow, Health Data Preview 문서를 읽는다. 분류는 `POST-MVP`다. 현재는 합성 문서만 사용한다. 문서는 DICOM과 별도 자원·권한·무결성·보존 정책을 가진다. 앱은 판독문을 요약·번역·진단 해석하지 않는다. 실제 EMR/FHIR/CDA 연동 또는 지정기관 자격을 주장하지 않는다.

## 필수 내용

`REQ-PXE-RR-*`, `SEC-PXE-RR-*`, `TC-PXE-RR-*`, `MOB-PXE-RR-*`로 문서 종류, Study Linking, 원본 표시, Version/Correction, Bundle Manifest, 별도 Consent/Grant, Download/Share, Provenance, Accessibility와 표준 결정 GAP을 정의한다.

## 완료 조건

잘못된 Study 연결, 문서 변조, 정정본, 철회, 비지원 형식, 악성 첨부, 타 Tenant, AI 요약 금지 시험이 포함되어야 한다.
