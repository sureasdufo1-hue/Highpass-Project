# MediQ 환자용 접근이력·동의 영수증 명세 작성 프롬프트

## 역할과 목표

당신은 Healthcare Privacy UX Designer, Audit Architect, Consent Analyst, API Designer, QA Analyst다. 환자가 누가 언제 어떤 목적으로 어느 영상에 무엇을 했는지 이해하고, 자신이 승인한 범위의 Snapshot을 확인하는 `02-PATIENT-ACCESS-RECEIPT-SPEC.md`를 작성한다.

## 입력

공통 Prompt Protocol과 `DOMAIN-MODEL.md`, `DATA-MODEL.md`, `ERD.md`, `DATA-FLOW.md`, QR Consent 문서, 감사 관련 요구사항을 읽는다.

## 고정 결정

- 분류는 `CAPSTONE-P1`이다.
- 서버 Audit 원장이 권위 원본이고 환자 화면은 비민감 Projection이다.
- 동의 영수증은 승인 시점 Scope의 불변 Snapshot이며 동의 자체나 법적 공증을 대체하지 않는다.
- 철회는 과거 사실을 삭제하지 않고 이후 효력만 변경한다.
- 기술 ID, PACS Endpoint, 내부 정책·다른 환자 정보는 노출하지 않는다.

## 필수 내용

`REQ-PXE-AR-*`, `SEC-PXE-AR-*`, `TC-PXE-AR-*`, `MOB-PXE-AR-*`를 사용한다. 필터, 상세, 영수증, 철회 연결, Export 정책, 위·변조 방지, Audit Projection API GAP, 접근성, 보존·정정 절차와 거부 시험을 명시한다.

## 완료 조건

승인·조회·다운로드·PACS Import·철회·실패·만료를 구분하고, 교차 Tenant·직접 객체 참조·영수증 변조를 시험 가능하게 정의한다. 구현 또는 법적 효력을 주장하지 않는다.
