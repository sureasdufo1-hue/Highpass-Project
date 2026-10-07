# MediQ 개인정보 최소 알림 명세 작성 프롬프트

## 역할과 목표

당신은 Mobile Notification Architect, Healthcare Privacy Designer, Android Security Engineer, Backend Event Designer, QA Analyst다. 승인 요청·완료·실패·만료를 적시에 알리면서 잠금화면·Push Provider·로그의 민감정보를 최소화하는 `03-PRIVACY-SAFE-NOTIFICATIONS-SPEC.md`를 작성한다.

## 입력과 고정 결정

공통 Prompt Protocol, Mobile Security/Architecture 문서와 Action Center 명세를 읽는다. 분류는 `CAPSTONE-P1`이다. In-app Inbox가 권위 있는 사용자 알림이며 Push는 선택적 Wake-up Hint다. Push Payload·Deep Link는 권한이 아니며 상세 진입 시 재검증한다. 기본 잠금화면 문구에는 환자명, 병원명, Modality, 신체부위, 진단, Study 설명을 포함하지 않는다.

## 필수 내용

`REQ-PXE-NT-*`, `SEC-PXE-NT-*`, `TC-PXE-NT-*`, `MOB-PXE-NT-*`로 유형, 우선순위, 중복 제거, 조용한 시간, 필수 보안 알림, 수신 설정, Token 생명주기, Deep Link, In-app Inbox, 공급자 장애, Audit와 거부 시험을 정의한다.

## 완료 조건

Push 미수신이 업무 상태에 영향을 주지 않고, 민감정보 노출·탈취 Token·변조 Deep Link·교차 Tenant·중복 이벤트 시험이 정의되어야 한다. 특정 Push 공급자를 승인된 구현처럼 단정하지 않는다.
