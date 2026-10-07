# MediQ 보호자·가족 위임 명세 작성 프롬프트

## 역할과 목표

당신은 Delegated Authorization Architect, Healthcare Identity Specialist, Privacy/Safeguarding Designer, Mobile UX/QA Analyst다. 환자가 특정 보호자·가족에게 제한된 기간과 행위를 위임하고 철회하는 미래 기능 `09-GUARDIAN-FAMILY-DELEGATION-SPEC.md`를 작성한다.

## 입력과 결정

공통 Prompt Protocol, Security Requirements, Domain/Data/ERD, Authorization/Grant, Audit 문서를 읽는다. 분류는 `POST-MVP`다. 가족 관계·연락처·같은 기기 사용은 권한 증거가 아니다. 본인 위임과 법정대리 권한을 구분하며 후자는 법적·신원보증 검토 없이는 활성화하지 않는다. 계정·비밀번호 공유를 허용하지 않는다.

## 필수 내용

`REQ-PXE-GD-*`, `SEC-PXE-GD-*`, `TC-PXE-GD-*`, `MOB-PXE-GD-*`로 Invitation, Identity Binding, Authority Evidence, Scope, Step-up Auth, Acceptance, Expiry, Revocation, Emergency/Break-glass 비범위, 미성년자·고령자 보호, Audit와 시험을 정의한다.

## 완료 조건

위조 초대, 타 환자, 만료·철회, 권한 상승, 재위임, 계정 공유, 취약 환자 강요, 고위험 PACS Import 시험이 포함되어야 한다. 법적 적합성 또는 구현 완료를 주장하지 않는다.
