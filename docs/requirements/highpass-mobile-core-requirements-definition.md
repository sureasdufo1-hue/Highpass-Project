# Highpass Mobile-Core 요구사항정의서

> **CAPSTONE MVP / SYNTHETIC DATA / TECHNICAL TEST ENVIRONMENT ONLY**  
> 본 문서는 법률 적합성 판단, 병원 보안 승인, 의료기기 인증, ISMS-P 인증 또는 운영 준비 완료를 의미하지 않는다.

| 문서 항목 | 내용 |
|---|---|
| 프로젝트 | Highpass Mobile-Core |
| 문서 버전 | v3.0-DRAFT-BASELINE |
| 기준일 | 2026-09-01 |
| 문서 상태 | 모바일 저장 P0 구조변경 기준선·승인 전 |
| 대상 환경 | 가상 A·B 병원, 합성 환자·DICOM, 캡스톤 기술시험 환경 |
| 선행 문서 | v2.1 통합 요구사항정의서, v2 업무흐름·유스케이스, 착수계획서, v2 Draw.io |
| 승인자 | PM / 지도교수 / 의료정보·모바일·보안 검토자 `[결정 필요]` |

## 1. 문서 개요

본 문서는 기존 Highpass 요구사항을 Mobile-Core 구조로 전면 재정의한다. 핵심 변경은 환자가 A 병원에서 발급받은 암호화 CT·MRI 영상 패키지를 모바일 앱 전용영역에 보관하고 B 병원에서 QR 핸드오프를 승인해 B Gateway로 전달하는 기능을 P0로 승격하는 것이다.

상태 표기는 다음과 같다.

| 상태 | 의미 |
|---|---|
| `[구현 완료]` | 코드와 자동시험에서 요구 행위 확인 |
| `[부분 구현]` | 일부 코드·시험은 있으나 Mobile-Core 종단흐름 부족 |
| `[구현 예정]` | 저장소에 구현 없음, 목표 범위에 포함 |
| `[검증 필요]` | 구현 또는 설계는 있으나 실행 증적 불충분 |
| `[가정]` | 승인 전 설계 가정 |
| `[결정 필요]` | 이해관계자 결정 없이는 확정 불가 |
| `[범위 제외]` | 현재 캡스톤에서 구현하지 않음 |

## 2. 변경 배경

기존 v2는 A PACS 원본 유지와 DICOMweb 원격조회를 P0로 두고 모바일 DICOM 저장을 P1로 분리했다. Mobile-Core는 환자 휴대폰을 분실·탈취 가능한 반신뢰 운반매체로 사용하되 평문 파일이 아닌 암호화 패키지만 앱 전용영역에 저장한다.

| 기존 요구사항 | 변경 후 요구사항 | 처리 | 변경 사유 |
|---|---|---|---|
| 모바일 DICOM 저장 P1 | 암호화 모바일 영상 패키지 P0 | 수정 | 핵심서비스 변경 |
| 모바일은 동의·QR 단말 | 모바일은 기기등록·암호화 저장·핸드오프 수행 | 수정 | 환자 매체 흐름 추가 |
| QR은 동의/Ticket 전달 | QR은 B 병원 핸드오프 세션 시작·바인딩 | 수정 | B 수신 절차 추가 |
| 원격조회가 기본 P0 | 모바일 매체와 원격조회 모두 P0 | 확장 | 네트워크 상황별 이중 경로 |
| 모바일 위협은 P1 | 분실·루팅·백업·악성앱 통제 P0 | 수정 | 공격면 증가 |
| 모바일 관련 DB 없음 | Device·Package·Handoff·Receipt 모델 신규 | 신규 | 수명주기·감사 필요 |

## 3. Highpass Mobile-Core 서비스 정의

> Highpass는 환자 동의와 기관·의료진 인증을 기반으로 A 병원 PACS의 CT·MRI 영상을 암호화된 모바일 영상 패키지로 환자에게 전달하고, B 병원 방문 시 QR 기반 핸드오프를 통해 해당 영상을 B 병원 Viewer 또는 PACS로 전달하는 클라우드 관리형 의료영상 전송 플랫폼이다.

QR에는 영상·개인정보·복호화 키를 넣지 않는다. 실제 영상은 AES-256-GCM으로 보호한 패키지로 전달한다. QR 스캔, 환자 모바일 승인, B 의료진 인증, 동의·기관·목적·Study/Series·행위 정책이 모두 성공해야 B Gateway가 수신한다.

## 4. 기존 구조와 변경 구조 비교

| 항목 | v2 | Mobile-Core |
|---|---|---|
| A 원본 | A PACS 유지 | 유지 |
| 환자 모바일 | QR·동의·승인 | 암호화 패키지 저장·QR 승인·B 전달 |
| 데이터 경로 | A Edge→Relay→B Edge | A Edge→Mobile→B Edge와 기존 Relay 경로 병행 |
| QR | 동의·Ticket 참조 | B 핸드오프 세션의 일회성 Ticket |
| 키 | 서버/Edge 중심 | 패키지 DEK, 기기 키, B 수신 키 종단 추가 |
| 상태 | 동의·접근token | Device·Package·Handoff·Receipt 추가 |
| 위험 | PACS·Relay·token | 분실·루팅·백업·악성앱·저장소 추출 추가 |
| 구성도 | 모바일은 영상 저장소 아님 | 모바일 암호화 Vault와 양방향 데이터 경로 필요 |

## 5. 시스템 범위

### 5.1 신뢰영역

- A 병원: PACS/Orthanc, A Edge, Study 선택, 패키지 생성·암호화·발급.
- 모바일: 기기등록, 환자 인증, 앱 잠금, 암호화 Vault, QR 스캔, 승인·전달·삭제.
- Control Plane: 기관·사용자·동의·Ticket·기기·Handoff·정책·상태·감사·키 메타데이터.
- Data Plane: A→Mobile, Mobile→B, A→Relay→B 암호문 전송, TTL 캐시.
- B 병원: 의료진 OIDC/MFA, Handoff 세션, B Edge 수신·검증, OHIF, 선택적 PACS.

### 5.2 불변조건

1. 원본 DICOM은 A PACS에 유지한다.
2. 모바일에는 평문 DICOM을 저장하지 않는다.
3. 모바일 패키지는 앱 샌드박스 외부·갤러리·일반 파일영역·일반 백업에 노출하지 않는다.
4. QR만으로 패키지 복호화·조회·전달하지 않는다.
5. B 의료진 인증과 환자 승인 중 하나라도 없으면 Handoff를 거부한다.
6. 모바일 경로와 Cloud Relay 경로는 동일 동의·scope·행위·감사 정책을 사용한다.

## 6. 이해관계자 및 행위자

| 행위자 | 역할 | 접근 데이터·업무 | 인증·권한 | 감사 |
|---|---|---|---|---|
| 환자/보호자 | 동의·기기등록·패키지 관리·Handoff 승인 | 자신의 합성 Study·암호화 패키지 | 본인확인, 앱 잠금; 보호자 정책 결정 | 등록·동의·승인·삭제 |
| A 의료진 | Study/Series 선택·패키지 발급 | 소속기관 환자·영상 | OIDC 목표/Mock, RBAC+ABAC | 발급·범위 |
| B 의료진 | Handoff 세션·조회·편입 | 승인 패키지·영상 | OIDC+MFA 목표 | 세션·수신·조회·저장 |
| 병원 관리자 | 사용자·Gateway·기기정책 | 소속기관 관리정보 | 관리자 MFA 목표 | 등록·정책변경 |
| 운영·보안관리자 | 서비스·기기차단·감사·사고대응 | 최소 운영·감사정보 | 플랫폼/보안 역할 | 조치·조회 |
| Mobile App | Vault·QR·전송·삭제 | 암호문·manifest·wrapped key | device binding+local auth | 접근·전송·삭제 |
| A/B Edge | 패키지 발급·수신·검증·PACS 연계 | 승인 DICOM·암호문 | 기관별 mTLS | 전송·검증·오류 |
| Control/Policy | 동의·기기·Ticket·Handoff·정책 | 최소 메타데이터 | service identity | 모든 결정 |
| IdP/KMS/HSM | 의료진 인증·키 수명주기 | 최소 claims·keys | 외부 연동 BLOCKED | 인증·키사용 |
| A/B PACS | 원본·선택 사본 | DICOM | Edge 전용 mTLS/AE | 검색·조회·저장 |

## 7. 모바일 매체 기반 전송 개요

### 7.1 패키지 발급

1. A 의료진 인증과 환자·Study/Series·B 병원·목적 선택.
2. 환자 동의 승인.
3. A Edge가 승인 객체를 조회하고 Manifest·파일 수·용량·UID·hash를 생성.
4. 패키지별 DEK와 고유 nonce로 AES-256-GCM 암호화.
5. 등록·정상 상태 기기와 환자 바인딩 확인.
6. TLS로 모바일 앱 전용 Vault에 암호문·manifest·key envelope 저장.
7. 수신·저장 결과와 감사로그 기록.

### 7.2 B 병원 Handoff

1. B 의료진 OIDC/MFA 인증 후 HandoffSession 생성.
2. B 병원·의료진·목적·Study·TTL에 바인딩된 일회성 QR 발급.
3. 모바일 앱이 QR을 스캔하고 환자가 생체/PIN으로 승인.
4. Control이 동의·기기·B 기관·의료진·scope·Ticket 상태 검증.
5. 모바일이 암호화 패키지를 B Edge로 청크 전송.
6. B Edge가 manifest·파일수·UID·hash·AEAD tag를 검증.
7. 승인 권한에 따라 Viewer 조회 또는 PACS 편입.
8. Receipt·상태·감사 기록 후 Ticket 폐기, 패키지 삭제/접근불능 처리.

## 8. 클라우드 중계·원격조회 개요

A PACS→A Edge→암호문 Relay→B Edge→OHIF/B PACS 경로를 P0로 유지한다. 모바일에 패키지가 없거나 정책상 원격조회가 적합한 경우 사용한다. 모바일과 Relay 경로의 결과는 동일한 동의·기관·사용자·목적·Study/Series·VIEW/DOWNLOAD/PACS_IMPORT 정책과 `auditSessionId`에 연결한다.

## 9. 업무목표 및 성공기준

| 목표 | 성공기준 |
|---|---|
| 암호화 모바일 운반 | 앱 외부 평문 DICOM 0건, package tag/hash 검증 성공 |
| 환자 통제 | 동의·기기 인증·명시적 Handoff 승인 없이는 B 전달 0건 |
| 기관 통제 | 바인딩되지 않은 병원·의료진·Study 전달 0건 |
| 복구 가능 전송 | 중단 후 중복·nonce 재사용 없이 승인 청크만 재개 |
| 추적성 | 발급→저장→QR→전달→조회/편입→삭제 이벤트 종단 연결 |
| 시연 가능성 | 합성 DICOM·가상병원·지원 모바일 환경에서 정상·음성 흐름 재현 |

## 10. 기능 요구사항

아래 세부 절의 모든 표는 입력·처리·결과·감사·수용기준을 포함한다. Mobile-Core 신규 기능은 저장소에 구현이 없어 `[구현 예정]`이다.

### 10.1 공통 인증·기관·동의·정책

| ID/명 | 내용·행위자 | 우선순위/상태 | 사전조건·입력 | 처리·결과 | 수용기준·검증 | 감사·의존성 |
|---|---|---|---|---|---|---|
| FR-AUTH-001 의료진 인증 | Control은 JWT 서명·iss·aud·exp·role·hospital을 검증한다. | P0/[구현 완료] | IdP token | principal 생성/거부 | 위반 token 100% 거부; 단위시험 | LOGIN; IdP |
| FR-AUTH-002 B MFA | B 의료진은 Handoff 전 MFA를 완료한다. | P0/[구현 예정·외부 BLOCKED] | 실제 IdP | MFA claim 확인 | 미완료 전달 0건; E2E | LOGIN; IdP |
| FR-INST-001 기관 바인딩 | A/B 기관과 Gateway 상태를 관리하고 요청에 바인딩한다. | P0/[부분 구현] | hospital/gateway | ACTIVE/ONLINE 검사 | 불일치·OFFLINE 거부 | POLICY; Gateway |
| FR-CONSENT-001 동의 | 환자·A/B·목적·기간·Study/Series·행위를 저장한다. | P0/[구현 완료] | 환자승인 | ACTIVE/APPROVED | 필수값·범위시험 | CONSENT; Policy |
| FR-CONSENT-002 철회 | 철회 시 신규 발급·Handoff·조회와 활성 token을 차단한다. | P0/[부분 구현] | consentId | REVOKED·token 폐기 | 철회 후 접근 0건 | REVOKE; Ticket/Device |
| FR-POLICY-001 결합정책 | 동의·기기·기관·의료진·목적·기간·scope·행위를 모두 검사한다. | P0/[부분 구현] | context | ALLOW/DENY | 하나라도 불일치 시 DENY | POLICY; 전체 |
| FR-POLICY-002 행위분리 | VIEW·DOWNLOAD·HANDOFF·PACS_IMPORT를 별도 권한으로 평가한다. | P0/[부분 구현] | requestedAction | 행위별 decision | VIEW만으로 저장 0건 | POLICY; Viewer/PACS |

## 11. 모바일 앱 요구사항

| ID/명 | 내용·행위자 | 우선순위/상태 | 사전조건·입력 | 처리·결과 | 수용기준·검증 | 감사·의존성 |
|---|---|---|---|---|---|---|
| FR-MOBILE-001 기기등록 | 앱은 deviceId·platform·appVersion·attestationRef를 등록한다. | P0/[구현 예정] | 환자 인증 | REGISTERED | 미등록 기기 발급 0건; API시험 | DEVICE_REGISTERED; Control |
| FR-MOBILE-002 계정바인딩 | 한 기기 binding을 환자계정과 연결하고 상태를 관리한다. | P0/[구현 예정] | 등록기기 | ACTIVE binding | 타환자 package 접근 0건 | DEVICE_BOUND; Auth |
| FR-MOBILE-003 앱잠금 | 패키지 열람·전달·삭제 전 생체인증 또는 PIN을 요구한다. | P0/[구현 예정] | OS local auth | unlocked session | 인증 실패 시 key 접근 0건 | LOCAL_AUTH; OS |
| FR-MOBILE-004 분실차단 | 분실신고 기기를 BLOCKED로 바꾸고 key unwrap·Handoff를 차단한다. | P0/[구현 예정] | deviceId/reason | BLOCKED | 신고 후 전달 0건 | DEVICE_BLOCKED; Key/Policy |
| FR-MOBILE-005 루팅·탈옥 | 무결성 신호 실패 시 발급·Handoff를 거부하거나 제한한다. | P0/[구현 예정] | attestation | DENY/RESTRICT | 정책 fixture 결과 일치 | DEVICE_RISK; Attestation |
| FR-MOBILE-006 앱버전 | 최소 지원버전 미만 앱의 신규 package 발급을 차단한다. | P0/[구현 예정] | appVersion | update required | 구버전 발급 0건 | APP_VERSION_DENIED |
| FR-MOBILE-007 앱무결성 | 앱 서명·attestation 결과를 기기상태에 반영한다. | P0/[구현 예정] | attestation token | trusted/risky | 위조 token 거부 | APP_INTEGRITY |
| FR-MOBILE-008 기기교체 | 기존 binding·키접근을 폐기하고 재등록·재발급한다. | P0/[구현 예정] | old/new device | old REVOKED | 구기기 접근 0건 | DEVICE_REPLACED |
| FR-MOBILE-009 백업제외 | package·DEK envelope를 OS 일반 백업·cloud sync 대상에서 제외한다. | P0/[구현 예정] | app config | no-backup storage | backup artifact 0건; 설정/복원시험 | BACKUP_POLICY |
| FR-MOBILE-010 외부노출제한 | gallery·공유 sheet·일반 파일앱·외부 URI 접근을 차단한다. | P0/[구현 예정] | package | sandbox only | 외부앱 열람 0건 | EXTERNAL_ACCESS_DENIED |
| FR-MOBILE-011 화면보호 | 민감 화면의 capture/overlay 위험을 플랫폼 범위에서 제한하고 경고한다. | P0/[구현 예정] | viewer/status | protected UI | capture 정책시험 | SCREEN_PROTECTION |
| FR-MOBILE-012 상태표시 | 저장·준비·전송·만료·삭제·오류를 텍스트와 아이콘으로 표시한다. | P0/[구현 예정] | package state | accessible UI | 상태-서버 일치 | STATUS_VIEWED |

## 12. 영상 패키지·암호화 요구사항

| ID/명 | 내용·행위자 | 우선순위/상태 | 사전조건·입력 | 처리·결과 | 수용기준·검증 | 감사·의존성 |
|---|---|---|---|---|---|---|
| FR-PACKAGE-001 패키징 | A Edge는 승인 DICOM만 packageId/version으로 묶는다. | P0/[구현 예정] | ALLOW·UID | CREATED package | scope 밖 객체 0건 | PACKAGE_CREATED; PACS |
| FR-PACKAGE-002 Manifest | UID·파일수·용량·객체hash·알고리즘버전을 Manifest에 기록한다. | P0/[구현 예정] | objects | canonical manifest | 실제 객체와 100% 일치 | MANIFEST_CREATED |
| FR-PACKAGE-003 범위 | Study/Series/Instance 범위를 동의와 교차검증한다. | P0/[구현 예정] | consent scope | allowed set | 추가 UID 포함 0건 | SCOPE_CHECK |
| FR-PACKAGE-004 대용량청크 | package를 고유 chunkId·offset·hash 단위로 전송한다. | P0/[구현 예정] | chunk policy | resumable chunks | 중복/누락 탐지 | CHUNK_TRANSFER |
| FR-PACKAGE-005 버전·중복 | package version·content digest로 중복 발급·수신을 판별한다. | P0/[구현 예정] | packageId/digest | reuse/reject | 중복 정책 일치 | DUPLICATE_PACKAGE |
| FR-PACKAGE-006 무결성 | B Edge는 Manifest·객체hash·GCM tag를 모두 검증한다. | P0/[구현 예정] | ciphertext | VERIFIED/FAILED | 1-bit 변조 100% 거부 | INTEGRITY_RESULT |
| FR-PACKAGE-007 재개 | 중단 후 성공 chunk를 확인하고 나머지만 새 session에서 재개한다. | P0/[구현 예정] | receipt | resumed upload | 중복 객체·nonce 재사용 0건 | TRANSFER_RESUMED |
| FR-KEY-001 AEAD | DICOM package는 AES-256-GCM으로 암호화한다. | P0/[구현 예정] | plaintext/DEK/nonce | ciphertext/tag | 표준 vector·변조시험 | PACKAGE_ENCRYPTED |
| FR-KEY-002 DEK | package별 또는 전송별 256-bit DEK를 CSPRNG로 생성한다. | P0/[구현 예정] | packageId | DEK ref | package 간 DEK 재사용 0건 | KEY_CREATED |
| FR-KEY-003 nonce | 동일 DEK 아래 파일/청크 nonce를 재사용하지 않는다. | P0/[구현 예정] | chunk counter/random | unique nonce | 중복 0건 | NONCE_POLICY |
| FR-KEY-004 KEK분리 | DEK는 기기/B 수신 KEK로 wrapping하고 데이터와 분리 보관한다. | P0/[구현 예정] | recipient keys | key envelope | package에 평문 DEK 없음 | KEY_WRAPPED |
| FR-KEY-005 모바일키 | Android Keystore 또는 iOS Keychain/Secure Enclave를 사용한다. | P0/[구현 예정] | device capability | non-exportable key ref | key file/log 0건 | DEVICE_KEY_USED |
| FR-KEY-006 키폐기 | 만료·철회·분실·삭제 시 unwrap 권한과 관련 key ref를 폐기한다. | P0/[구현 예정] | revoke/delete | inaccessible package | 폐기 후 decrypt 0건 | KEY_REVOKED |
| FR-KEY-007 Crypto Agility | algVersion·keyId·provider를 기록하고 알고리즘 교체를 지원한다. | P0/[구현 예정] | config | versioned envelope | 구/신 버전 정책시험 | CRYPTO_VERSION |

### 12.1 모바일 저장·보존·삭제 요구사항

| ID/명 | 내용·행위자 | 우선순위/상태 | 사전조건·입력 | 처리·결과 | 수용기준·검증 | 감사·의존성 |
|---|---|---|---|---|---|---|
| FR-STORAGE-001 전용Vault | Mobile은 package를 앱 샌드박스의 비공개 전용영역에 저장한다. | P0/[구현 예정] | encrypted package | private file/Vault | 다른 UID·앱 접근 0건 | PACKAGE_STORED; OS |
| FR-STORAGE-002 평문금지 | package 생성·복호화 과정의 평문 파일을 지속 저장하지 않는다. | P0/[구현 예정] | decrypt operation | memory/controlled temp only | 평문 artifact 0건 | PLAINTEXT_SCAN |
| FR-STORAGE-003 백업제외 | Vault·key envelope·partial chunk를 일반 backup·cloud sync에서 제외한다. | P0/[구현 예정] | storage config | no-backup | restore 후 artifact 0건 | BACKUP_EXCLUDED |
| FR-STORAGE-004 용량검사 | 예상 package+여유공간을 계산하고 부족하면 다운로드 전에 거부한다. | P0/[구현 예정] | manifest size/free space | accept/reject | low-space 잔존파일 0건 | STORAGE_DENIED |
| FR-STORAGE-005 TTL | package별 expiresAt과 삭제정책을 저장하고 만료 시 잠금·삭제한다. | P0/[구현 예정] | package policy | EXPIRED/DELETED | TTL+허용오차 내 접근불능 | PACKAGE_EXPIRED |
| FR-STORAGE-006 삭제증적 | 완료·철회·분실·사용자삭제 후 DeletionReceipt를 생성한다. | P0/[구현 예정] | delete trigger | receipt | package 없음·receipt 존재 | PACKAGE_DELETED |
| FR-STORAGE-007 실패정리 | 중단·오류의 partial chunk와 temp를 제한시간 후 삭제한다. | P0/[구현 예정] | FAILED/timeout | cleanup | orphan artifact 0건 | PARTIAL_CLEANED |

## 13. QR·핸드오프 요구사항

| ID/명 | 내용·행위자 | 우선순위/상태 | 사전조건·입력 | 처리·결과 | 수용기준·검증 | 감사·의존성 |
|---|---|---|---|---|---|---|
| FR-QR-001 세션QR | B 병원은 opaque handoffTicket QR을 생성한다. | P0/[구현 예정] | B 인증 | ISSUED QR | PII/DICOM/key 0건 | QR_ISSUED |
| FR-QR-002 TTL·1회성 | QR은 짧은 TTL과 원자적 1회 소비를 사용한다. | P0/[구현 예정] | session | CONSUMED/EXPIRED | 동시 N건 중≤1 성공 | QR_CONSUMED/DENIED |
| FR-QR-003 바인딩 | QR을 B 기관·의료진·목적·Study·환자·세션에 바인딩한다. | P0/[구현 예정] | bindings | verified context | 하나라도 불일치 거부 | QR_VALIDATED |
| FR-HANDOFF-001 세션 | B 의료진은 HandoffSession을 만들고 수신범위·TTL을 지정한다. | P0/[구현 예정] | OIDC/MFA | READY session | 미인증 생성 0건 | HANDOFF_CREATED |
| FR-HANDOFF-002 모바일스캔 | Mobile App은 B QR을 앱 내부에서 해석하고 서버 검증한다. | P0/[구현 예정] | QR | verified session | 일반 scanner만으로 전달 불가 | QR_SCANNED |
| FR-HANDOFF-003 환자승인 | 환자는 local auth 후 package·B 병원·목적을 재확인해 승인한다. | P0/[구현 예정] | package/session | APPROVED | 승인 전 upload 0건 | HANDOFF_APPROVED |
| FR-HANDOFF-004 전달 | Mobile은 TLS로 B Edge에 승인 ciphertext chunk만 보낸다. | P0/[구현 예정] | approval | UPLOADING/RECEIVED | 다른 endpoint 전달 0건 | HANDOFF_TRANSFER |
| FR-HANDOFF-005 Receipt | B Edge는 객체·무결성·수신결과를 서명/인증된 Receipt로 반환한다. | P0/[구현 예정] | verified package | receipt | manifest와 결과 일치 | DELIVERY_RECEIPT |
| FR-HANDOFF-006 완료폐기 | 완료 후 Ticket을 폐기하고 정책에 따라 package 삭제/잠금한다. | P0/[구현 예정] | receipt | COMPLETED/DELETED | 재사용·재전달 0건 | HANDOFF_COMPLETED |
| FR-HANDOFF-007 실패재시도 | 네트워크 오류만 제한 횟수 재시도하고 정책·무결성 오류는 재시도하지 않는다. | P0/[구현 예정] | failure | retry/FAILED | 분류·횟수 일치 | HANDOFF_FAILED/RETRY |
| FR-HANDOFF-008 역방향QR | 환자 QR를 B가 스캔할 때도 B 인증·환자 앱 승인·서버 바인딩을 요구한다. | P0/[구현 예정] | patient QR | verified handoff | 복제 QR 단독 전달 0건 | REVERSE_QR |

## 14. DICOM·DICOMweb 요구사항

| ID/명 | 내용·행위자 | 우선순위/상태 | 사전조건·입력 | 처리·결과 | 수용기준·검증 | 감사·의존성 |
|---|---|---|---|---|---|---|
| FR-DICOM-001 UID | Study/Series/SOP UID를 구분·검증한다. | P0/[부분 구현] | UID | valid/reject | 형식·scope 시험 | DICOM_REQUEST |
| FR-DICOM-002 A 원본 | A PACS 원본을 유지하고 Control에 Pixel Data를 지속 저장하지 않는다. | P0/[구현 완료] | PACS | distributed origin | 중앙 원본 0건 | DATA_FLOW |
| FR-DICOM-003 QIDO | 승인 메타데이터만 QIDO-RS로 검색한다. | P0/[구현 완료] | scoped token | filtered DICOM JSON | 범위 밖 0건 | QIDO |
| FR-DICOM-004 WADO | 승인 Instance/Frame을 WADO-RS로 조회한다. | P0/[구현 완료] | scoped token | object/frame | UID 음성시험 | WADO |
| FR-DICOM-005 Edge경유 | Browser/Mobile은 A PACS에 직접 접근하지 않는다. | P0/[구현 완료] | network | Edge only | 직접 host port 0건 | NETWORK_DENY |
| FR-DICOM-006 mTLS | Gateway-PACS와 Gateway 간 기관 인증을 사용한다. | P0/[부분 구현] | cert | trusted channel | 무인증·비신뢰·만료 거부 | MTLS |

## 15. 인증·권한·동의 요구사항

1. A/B 의료진은 독립 principal과 기관으로 인증한다.
2. 환자 동의와 B 의료진 MFA를 동시에 요구한다.
3. MobileDevice 상태가 ACTIVE이고 환자와 바인딩돼야 한다.
4. Package·Handoff·Viewer·PACS 단계마다 정책을 재검증한다.
5. VIEW, DOWNLOAD, MOBILE_STORE, HANDOFF, PACS_IMPORT 권한을 분리한다.
6. 동의 철회·기기분실·Ticket 만료 중 하나라도 발생하면 신규 전달을 차단한다.
7. 이미 B PACS에 편입된 사본은 B 병원 보존정책 대상으로 별도 고지한다.

### 15.1 Viewer·PACS·감사·운영 요구사항

| ID/명 | 내용·행위자 | 우선순위/상태 | 사전조건·입력 | 처리·결과 | 수용기준·검증 | 감사·의존성 |
|---|---|---|---|---|---|---|
| FR-VIEW-001 승인조회 | OHIF는 무결성·정책 성공 package 또는 WADO 객체만 표시한다. | P0/[부분 구현] | VIEW allow | image display | 미승인 표시 0건 | IMAGE_VIEWED; Policy |
| FR-VIEW-002 직접입력차단 | 다른 Study/Series URL·UID 직접입력을 Gateway가 거부한다. | P0/[구현 완료] | scoped token | 403 | 범위 음성시험 | ACCESS_DENIED |
| FR-VIEW-003 최소표시 | 합성 데이터·Reference Viewer 배지와 최소 환자참조만 표시한다. | P0/[부분 구현] | verified package | protected UI | PII/token/path 노출 0건 | VIEW_OPENED |
| FR-PACS-001 별도편입권한 | B PACS 저장은 `PACS_IMPORT`와 B 저장정책 승인을 요구한다. | P0/[구현 예정] | verified package | allow/deny | VIEW만으로 저장 0건 | IMPORT_DECISION |
| FR-PACS-002 선택객체저장 | 승인 UID만 STOW-RS 또는 승인 C-STORE로 편입한다. | P0/[구현 예정] | import allow | object receipt | 범위 밖 저장 0건 | IMPORT_RESULT |
| FR-PACS-003 부분결과 | 성공·중복·실패 SOP를 구분해 PARTIAL/COMPLETED/FAILED를 기록한다. | P0/[구현 예정] | PACS response | per-object result | 응답·상태 일치 | IMPORT_PARTIAL |
| FR-AUDIT-001 종단감사 | 등록·동의·package·key·QR·Handoff·조회·편입·삭제·실패를 기록한다. | P0/[부분 구현] | event | append event | 정의 이벤트 누락 0% | Audit Store |
| FR-AUDIT-002 필드 | actor/device/hospital/patientRef/UID/package/handoff/action/result/reason/time/correlation/hash를 기록한다. | P0/[부분 구현] | audit context | minimal event | 필수필드 누락 0% | schema test |
| FR-AUDIT-003 무결성·권한 | 일반 수정·삭제를 금지하고 Hash Chain과 audit RBAC를 적용한다. | P0/[구현 완료] | audit records | 405/integrity result | 변조탐지·무권한거부 | AUDIT_INTEGRITY |
| FR-ERROR-001 오류분류 | 인증·정책·기기·저장공간·TLS·PACS·무결성·network 오류를 구분한다. | P0/[구현 예정] | failure | code/correlation | 오류별 계약 일치 | ERROR_EVENT |
| FR-ERROR-002 민감정보보호 | 오류·UI·로그에 stack, path, token, key, 직접식별정보를 출력하지 않는다. | P0/[부분 구현] | failure | generalized message | 민감pattern 0건 | ERROR_REDACTED |
| FR-ERROR-003 제한재시도 | network·일시 장애만 재시도하고 정책·암호 실패는 즉시 중단한다. | P0/[구현 예정] | classified error | retry/FAILED | 분류·횟수 일치 | RETRY_EVENT |
| FR-ADMIN-001 기기관리 | 관리자는 승인 범위에서 기기상태·위험·binding을 조회·차단한다. | P0/[구현 예정] | admin auth | ACTIVE/BLOCKED | 타기관 변경 0건 | DEVICE_ADMIN |
| FR-ADMIN-002 정책관리 | package TTL·max size·min app·risk·retry 정책 변경을 승인·감사한다. | P0/[구현 예정] | admin approval | versioned policy | 미승인 변경 미적용 | POLICY_CHANGED |
| FR-ADMIN-003 상태관제 | A/B Edge, Relay, Mobile delivery, PACS, DB 상태를 민감정보 없이 표시한다. | P1/[구현 예정] | health signals | status dashboard | 상태·health 일치 | STATUS_MONITORED |

## 16. 데이터 요구사항

| 객체 | 식별자·주요속성 | 생성/조회/변경 주체 | 보존·삭제 | 암호화·개인정보 | 감사 |
|---|---|---|---|---|---|
| Patient | patientRef, status | Control/환자·승인자 | 합성데이터 정책 | 가명참조 | 예 |
| MobileDevice | deviceId, platform, appVersion, riskStatus | App/Control/Admin | binding 종료까지 | device metadata | 예 |
| DeviceBinding | bindingId, patientRef, deviceId, status | Control/환자 | 교체·분실 시 폐기 | 민감 관계정보 | 예 |
| Consent | consentId, A/B, purpose, scope, validity, permission | 환자/Control | 법무 결정 필요 | 개인정보 참조 | 예 |
| TransferRequest | transferId, A/B, package scope, status | A 의료진/Control | 결정 필요 | 최소 metadata | 예 |
| TransferTicket | ticketId, digest, bindings, TTL, status | Ticket Service | TTL 후 원문삭제 | 원문 민감 | 예 |
| HandoffSession | handoffId, B clinician, purpose, TTL, state | B 의료진/Control | 완료·만료 정책 | 관계정보 | 예 |
| ImagingPackage | packageId, version, scope, cipher refs, state | A Edge/Mobile/B Edge | 완료·만료·철회 삭제 | 암호문 의료영상 | 예 |
| PackageManifest | manifestId, UID, count, size, hashes, algVersion | A Edge/B Edge | package와 연계 | 최소 metadata | 예 |
| Study/Series/Instance | DICOM UIDs, modality | A PACS/Edge | A 정책 | 민감 의료정보 | 예 |
| EncryptionKeyEnvelope | envelopeId, keyId, recipient, algVersion | KMS/Edge/App | revoke/delete 시 폐기 | 암호키 metadata | 예 |
| DeliveryReceipt | receiptId, handoffId, received objects/result | B Edge | 감사정책 | 최소 metadata | 예 |
| Revocation | revocationId, targetType/id, reason, timestamp | 환자/Admin/System | 감사정책 | 사유 최소화 | 예 |
| DeletionReceipt | deletionId, target, method, result | App/Relay/Edge | 감사정책 | metadata | 예 |
| AuditEvent | auditId/sessionId/actor/action/result/hash | 전체/Audit | 별도 보존 | 민감 log | 자체 |
| ErrorEvent | errorId, class, component, correlation | 전체 | 운영정책 | token/key/PII 금지 | 예 |

현재 DB에는 MobileDevice, DeviceBinding, TransferTicket, HandoffSession, ImagingPackage, PackageManifest, EncryptionKeyEnvelope, Receipt 엔티티가 없다. 모두 `[구현 예정]`이며 schema migration·최소수집 검토가 필요하다.

## 17. 보안·개인정보 요구사항

| 위협 | 필수 통제 | 연결 요구사항 |
|---|---|---|
| 분실·도난 | device BLOCKED, key unwrap 차단, 원격폐기 명령·다음 접속 시 집행 | FR-MOBILE-004, FR-KEY-006 |
| 저장소 추출 | 앱 전용 암호문 Vault, 평문 임시파일 금지 | FR-MOBILE-009~010, FR-STORAGE |
| QR 복제 | opaque Ticket, TTL, 원자 소비, 환자 local auth 승인 | FR-QR, FR-HANDOFF |
| 타 병원·타 환자 | 기관·사용자·patientRef·Study scope 바인딩 | FR-POLICY, FR-QR-003 |
| 악성 앱 | sandbox, exported component 최소화, 공유·URI 차단 | FR-MOBILE-010 |
| OS 백업 유출 | no-backup/ThisDeviceOnly 정책과 복원시험 | FR-MOBILE-009 |
| package 변조 | GCM tag, canonical Manifest, 객체 hash | FR-PACKAGE-006 |
| replay | unique nonce, Ticket 소비, idempotency·receipt | FR-KEY-003, FR-QR-002 |
| 비인가 다운로드·저장 | VIEW/DOWNLOAD/HANDOFF/PACS_IMPORT 분리 | FR-POLICY-002 |
| 철회 후 접근 | consent/device/token/key 상태 재검증 | FR-CONSENT-002 |
| 완료 후 잔존 | TTL, 삭제, key revoke, DeletionReceipt | FR-STORAGE, FR-KEY-006 |
| 감사 유출·변조 | 최소필드, RBAC, append-only, Hash Chain | FR-AUDIT |

암호화 계층은 다음과 같이 분리한다.

1. Mobile App↔Control API: TLS 1.3 우선.
2. Gateway↔PACS/Relay: TLS 1.3 우선·mTLS.
3. package 자체: AES-256-GCM AEAD.
4. 모바일 저장: 앱 샌드박스 암호문+OS Data Protection.
5. Relay 임시저장: 암호문+TTL+삭제증적.
6. B 수신영역: 암호화 임시영역·무결성 성공 후에만 사용.
7. key/data: DEK·KEK·ciphertext 분리.

## 18. 비기능 요구사항

| ID | 요구사항 | 상태 | 검증 |
|---|---|---|---|
| NFR-MOB-001 | 저장공간을 사전 계산하고 부족 시 생성·다운로드 전 거부한다. | `[구현 예정]` | low-space fixture |
| NFR-MOB-002 | 대용량 CT/MRI를 전체 메모리 적재 없이 streaming chunk로 처리한다. | `[구현 예정]` | memory profile; `[성능 목표 결정 필요]` |
| NFR-MOB-003 | network 단절·Wi-Fi/셀룰러 전환 후 승인 청크만 재개한다. | `[구현 예정]` | network switch test |
| NFR-MOB-004 | 배터리 부족·앱 종료·background 제한을 감지하고 손상 없는 상태로 중지한다. | `[구현 예정]` | lifecycle test |
| NFR-MOB-005 | B 수신·첫 조회 시간 목표는 `[성능 목표 결정 필요]`다. | `[결정 필요]` | load/E2E |
| NFR-MOB-006 | package·청크·Receipt 무결성 오류 미탐지 0건을 목표로 한다. | `[구현 예정]` | mutation test |
| NFR-MOB-007 | 앱 화면 응답성과 progress 갱신 목표는 `[성능 목표 결정 필요]`다. | `[결정 필요]` | UI profile |
| NFR-SRV-001 | 서버 가용성·RTO/RPO는 `[결정 필요]`이며 모든 polling은 timeout을 사용한다. | `[부분 구현]` | fault injection |
| NFR-AUD-001 | 정의된 중요 이벤트의 감사 누락률은 자동시험에서 0%여야 한다. | `[부분 구현]` | audit assertion |
| NFR-SCALE-001 | 패키지·청크 상태는 다기관·동시전송 확장을 방해하지 않는 식별자를 사용한다. | `[구현 예정]` | concurrency test |
| NFR-OS-001 | P0 지원 OS·최소버전·단일 플랫폼은 `[결정 필요]`다. | `[결정 필요]` | compatibility matrix |
| NFR-MNT-001 | 암호 알고리즘·package format·API는 version field로 호환성을 관리한다. | `[구현 예정]` | migration test |

## 19. 상태 및 생명주기

### 19.1 동의 상태

| 상태 | 진입조건 | 다음 상태 | 접근 | 감사 | 삭제·폐기 |
|---|---|---|---|---|---|
| DRAFT | 요청 초안 | CONSENT_PENDING, DELETED | 불가 | DRAFTED | 초안삭제 |
| CONSENT_PENDING | 환자확인 요청 | APPROVED, REJECTED, EXPIRED, REVOKED | 불가 | REQUESTED | Ticket 없음 |
| APPROVED | 환자 명시승인 | EXPIRED, REVOKED | 정책 후 가능 | APPROVED | 이력유지 |
| REJECTED | 환자 거부 | 새 DRAFT | 불가 | REJECTED | 이력정책 |
| EXPIRED | validUntil 경과 | 새 DRAFT | 불가 | EXPIRED | token/key 차단 |
| REVOKED | 철회 | 새 DRAFT | 미래접근 불가 | REVOKED | Ticket/key 차단 |

### 19.2 모바일 패키지 상태

| 상태 | 진입조건 | 허용 다음 상태 | 접근 가능 | 감사이벤트 | 삭제·폐기 |
|---|---|---|---|---|---|
| CREATED | scope package 생성 | ENCRYPTED, FAILED | 불가 | PACKAGE_CREATED | 평문 즉시정리 |
| ENCRYPTED | AEAD 성공 | DOWNLOADING, FAILED | A Edge만 | PACKAGE_ENCRYPTED | DEK wrapping |
| DOWNLOADING | 기기 전송 시작 | STORED_ON_DEVICE, FAILED | 불가 | DOWNLOAD_STARTED | partial TTL |
| STORED_ON_DEVICE | tag/hash 검증·Vault 저장 | READY_FOR_HANDOFF, EXPIRED, REVOKED, DELETED | local auth 후 상태확인 | DEVICE_STORED | 정책 TTL |
| READY_FOR_HANDOFF | 동의·기기 유효 | HANDOFF_PENDING, EXPIRED, REVOKED | 승인준비 | HANDOFF_READY | 유지 |
| HANDOFF_PENDING | B session/QR 검증 | UPLOADING_TO_B, FAILED, EXPIRED | local auth 후 승인 | HANDOFF_PENDING | Ticket TTL |
| UPLOADING_TO_B | 환자승인·B 인증 | INTEGRITY_VERIFIED, FAILED | 전송만 | UPLOAD_STARTED | partial TTL |
| INTEGRITY_VERIFIED | B tag/hash/manifest 성공 | VIEWED, IMPORTED, DELETED | 정책 범위 | INTEGRITY_OK | B 임시 TTL |
| VIEWED | Viewer 조회 | IMPORTED, DELETED, EXPIRED | token 유효 시 | VIEWED | 정책삭제 |
| IMPORTED | B PACS 영수증 성공 | DELETED | B 정책 | IMPORTED | 모바일삭제 가능 |
| EXPIRED | package/동의 만료 | DELETED | 불가 | PACKAGE_EXPIRED | key revoke/delete |
| REVOKED | 동의·기기·관리 철회 | DELETED | 불가 | PACKAGE_REVOKED | key revoke/delete |
| DELETED | 삭제·접근불능 증적 | 없음 | 불가 | PACKAGE_DELETED | receipt 유지 |
| FAILED | 암호·전송·정책 실패 | ENCRYPTED, DOWNLOADING, READY_FOR_HANDOFF, DELETED | 불가 | PACKAGE_FAILED | 재시도 분류/TTL |

금지 상태 전이는 409 또는 도메인 오류로 거부한다. 현재 코드에는 이 상태기계가 없으므로 모두 `[구현 예정]`이다.

## 20. 장애·예외·악용 시나리오

| Test ID | 시나리오 | 기대 결과 |
|---|---|---|
| MSEC-001 | 분실·BLOCKED 기기 Handoff | key unwrap·전달 거부·경보 |
| MSEC-002 | rooted/jailbroken·위조 attestation | 정책에 따른 발급·전달 거부 |
| MSEC-003 | backup 복원·다른 기기 파일복사 | key 사용·복호화 실패 |
| MSEC-004 | QR 복제·재사용·타병원 | 최대 1회 성공, 나머지 거부 |
| MSEC-005 | 환자 승인 없는 B 요청 | upload 0건 |
| MSEC-006 | 미인증 B 의료진 | session/전달 거부 |
| MSEC-007 | package/Manifest/tag 변조 | 수신·조회·편입 거부 |
| MSEC-008 | 다른 Study/Series 주입 | package 생성·수신 거부 |
| MOPS-001 | 저장공간 부족 | 다운로드 시작 전 오류·잔존 partial 정리 |
| MOPS-002 | 앱 종료·배터리 부족·network 전환 | 일관된 중지·승인 chunk 재개 |
| MOPS-003 | A/B Gateway·Relay 장애 | timeout·우회 금지·FAILED/PARTIAL |
| MOPS-004 | 일부 chunk 실패 | 누락목록·제한 재시도·중복 없음 |
| MSEC-009 | 동의 철회·package 만료 | 신규 Handoff 거부·key revoke |
| MAUD-001 | 감사기록 실패 | 중요 행위 중단 또는 승인된 내구성 큐 `[결정 필요]` |

## 21. P0·P1·제외 범위

### 21.1 P0

- A PACS 선택·동의·package 생성·AES-GCM 암호화.
- 최소 한 개 지원 모바일 플랫폼의 등록·앱잠금·Vault 저장·분실차단.
- B OIDC/MFA 경계·Handoff QR·환자 승인·Mobile→B Edge 전달.
- Manifest/hash/tag 검증·Viewer 조회·선택적 PACS 편입.
- 만료·철회·삭제·key 폐기·감사.
- 기존 QIDO/WADO Cloud Relay 경로.

### 21.2 P1

- 네트워크 없는 완전 오프라인 직접전송.
- 모바일 내 DICOM Viewer.
- Android·iOS 동시지원(단일 플랫폼 P0 가정 권고).
- ML-KEM hybrid·ML-DSA 서명.
- FHIR/IHE, 다기관, MDM/원격기기관리, 고도 위변조 탐지.

### 21.3 제외

- QR 자체 영상 저장, 평문 DICOM 일반 파일 저장.
- 실제 환자정보·실제 병원 PACS.
- 촬영 중 생영상, AI 판독, 모바일 임상판독 장비.
- 공식 의료기기 인증·법률 적합성·병원 운영 승인 완료 주장.

## 22. 수용기준

| AC | 수용기준 | 연결 시험 |
|---|---|---|
| AC-01 | 동의 없이 package가 생성되지 않는다. | CONSENT-DENY |
| AC-02 | 선택 scope 밖 DICOM이 package에 포함되지 않는다. | MSEC-008 |
| AC-03 | QR에 PII·DICOM·DEK가 포함되지 않는다. | QR-DECODE |
| AC-04 | 모바일에는 ciphertext·Manifest·envelope만 저장된다. | VAULT-INSPECT |
| AC-05 | gallery·일반 파일앱·공유로 열 수 없다. | MSEC-003/EXPORT |
| AC-06 | B 의료진 MFA와 환자 local 승인 없이는 Handoff가 진행되지 않는다. | MSEC-005~006 |
| AC-07 | 타병원·만료·재사용 QR을 거부한다. | MSEC-004 |
| AC-08 | package 변조 시 수신·조회·편입을 거부한다. | MSEC-007 |
| AC-09 | 중단 후 중복·nonce 재사용 없이 재개한다. | MOPS-002~004 |
| AC-10 | 철회·분실 후 추가 전달을 차단한다. | MSEC-001/009 |
| AC-11 | 수신 성공 후 승인 Viewer 조회가 가능하다. | HANDOFF-E2E |
| AC-12 | PACS_IMPORT 승인 시에만 B PACS 편입이 가능하다. | PACS-E2E |
| AC-13 | 발급부터 삭제까지 정의 감사 이벤트가 모두 존재한다. | MAUD-E2E |
| AC-14 | 완료·만료 정책에 따라 package가 삭제/접근불능이고 receipt가 남는다. | DELETE-TTL |

## 23. 요구사항 추적성

| 프로젝트 목표 | 유스케이스 | 요구사항 ID | 설계요소 | 테스트 ID | 증적 |
|---|---|---|---|---|---|
| 모바일 영상 저장 | package 발급 | FR-MOBILE, FR-STORAGE, FR-PACKAGE | Mobile Vault | AC-04/05 | 구현 후 test·screenshot |
| QR Handoff | B 전달 | FR-QR, FR-HANDOFF | Handoff Service | MSEC-004~006 | 구현 예정 |
| 암호화 package | 생성·수신 | FR-PACKAGE, FR-KEY | Package Builder/KMS | MSEC-007 | 구현 예정 |
| 모바일 분실대응 | 기기차단 | FR-MOBILE-004, FR-KEY-006 | Device Registry/Policy | MSEC-001 | 구현 예정 |
| 동의 철회 | revoke | FR-CONSENT-002 | Consent/Ticket/Key | MSEC-009 | token 부분 구현 |
| 무결성 | 수신검증 | FR-PACKAGE-006 | B Edge | MSEC-007 | 구현 예정 |
| PACS 편입 | import | FR-PACS/FR-POLICY-002 | B Edge/B PACS | PACS-E2E | 구현 예정 |
| 감사 | 종단추적 | FR-AUDIT/NFR-AUD-001 | Audit/Hash Chain | MAUD-E2E | 서버 일부 구현 |

## 24. 기존 문서 변경 영향

| 문서·항목 | 삭제·수정 내용 | 권고 |
|---|---|---|
| v2.1 아키텍처 불변조건 | “모바일은 QR·동의만” 삭제 | Mobile Vault·device trust로 교체 |
| v2 MVP/P1 범위 | 모바일 DICOM 저장을 P1에서 제거 | 암호화 package 저장을 P0로 이동 |
| v2 Workflow | 환자 모바일 역할·ALT 흐름 수정 | package 발급·Handoff 신규 UC 작성 |
| DB schema | Mobile/Package/Handoff 엔티티 없음 | 별도 migration 설계 |
| API | 기기·package·Handoff endpoint 없음 | 인터페이스 명세 신규 작성 |
| 보안 위협모델 | 분실·root·backup·악성app 부족 | Mobile threat model 추가 |
| 테스트 | 모바일 정상·음성 E2E 없음 | 단일 P0 플랫폼 자동시험 설계 |

기존 문서는 이번 작업에서 수정하지 않았다.

## 25. 법령·표준 검토

본 절은 기술 요구사항에 영향을 주는 참고자료이며 법률 결론이 아니다.

| 분류 | 공식 자료 | 영향 |
|---|---|---|
| 개인정보 안전조치 | [개인정보의 안전성 확보조치 기준, 2026-07-01 시행](https://www.law.go.kr/LSW/admRulInfoP.do?admRulSeq=2100000281400) | 접근권한, 암호화, 접속기록, 모바일·다운로드 위험분석 |
| 의료법·전자의무기록 | [국가법령정보센터 의료법](https://www.law.go.kr/) | A 원본·B 사본의 관리·보존·책임 검토 |
| DICOMweb | [DICOM PS3.18](https://www.dicomstandard.org/) | QIDO/WADO/STOW 계약 |
| Android | [Android Keystore](https://developer.android.com/privacy-and-security/keystore) | 기기보호 key·non-exportability 적용성 |
| Apple | [Keychain·Secure Enclave](https://developer.apple.com/documentation/security/protecting-keys-with-the-secure-enclave) | ThisDeviceOnly·local auth·key 보호 적용성 |
| AEAD | NIST SP 800-38D `[최신성 확인 필요]` | AES-GCM nonce·tag 정책 |
| PQC | NIST FIPS 203/204 | P1 Crypto Agility·실험 |

실제 모바일에 의료영상 사본을 보관·전달하는 처리근거, 제3자 제공·위탁, 동의문, 보존·삭제, 분실대응, B 사본 책임은 법무·개인정보보호책임자·병원 승인이 필요하다.

## 26. 미결정사항 및 위험

| ID | 미결정·위험 | 필요 결정·완화 |
|---|---|---|
| MC-DEC-01 | P0 Android/iOS 플랫폼과 최소 OS | 일정상 단일 플랫폼 권고 |
| MC-DEC-02 | 환자 본인·보호자·기기등록 신뢰수준 | 법무·UX·인증 설계 |
| MC-DEC-03 | package/QR/Handoff TTL과 최대 용량 | 성능·보존정책 |
| MC-DEC-04 | A→Mobile·Mobile→B key wrapping 종단 | KMS·device key 설계 |
| MC-DEC-05 | rooted 기기 완전차단 또는 위험기반 제한 | 보안·사용성 결정 |
| MC-DEC-06 | 분실기기 offline 상태 원격폐기 한계 | key expiration·서버차단 고지 |
| MC-DEC-07 | background 전송과 local auth key 접근 | OS 제약·UX 시험 |
| MC-DEC-08 | 완료 후 즉시삭제/기간보관/환자선택 | 법무·제품·병원 |
| MC-DEC-09 | B PACS 편입 사본 철회·삭제 책임 | B 병원·법무 |
| MC-DEC-10 | 실제 IdP/KMS/PACS 없이 P0 시연 수준 | Mock 경계 승인 |
| MC-RISK-01 | 모바일 앱·DB·API 신규범위로 일정 초과 | P0 단일 플랫폼·단일 Study·온라인 Handoff 제한 |
| MC-RISK-02 | 대용량 CT/MRI 저장·전송 성능 | 합성 소규모+상한·chunk·사전공간 검사 |

## 27. 결론 및 다음 단계

### 27.1 모바일 핵심기능으로 변경된 항목

- 모바일 기기등록·환자 binding·앱잠금·암호화 Vault.
- DICOM package·Manifest·AES-GCM·DEK/KEK·무결성.
- B HandoffSession·QR·환자승인·Mobile→B Edge.
- 분실·root·backup·외부공유·삭제·key revoke.

### 27.2 P0 핵심 요구사항

FR-MOBILE, FR-PACKAGE, FR-STORAGE, FR-HANDOFF, FR-QR, FR-KEY와 기존 동의·정책·DICOM·Viewer·Audit의 종단 연결이다. 현재 모바일 관련 항목은 모두 구현 예정이다.

### 27.3 P1 확장

완전 offline, 모바일 Viewer, 양 플랫폼 동시지원, ML-KEM/ML-DSA, FHIR/IHE, 대규모 다기관·MDM이다.

### 27.4 기존 문서에서 수정할 내용

모바일을 QR 단말로만 정의한 문구, 모바일 저장 P1 분류, 기존 Draw.io의 “영상 저장소가 아님” 문구를 Mobile-Core 승인 후 개정해야 한다.

### 27.5 주요 보안위협

분실·도난, 저장소 추출, root/jailbreak, backup·cloud sync, 악성앱·공유, QR replay, package 변조, nonce 재사용, 철회 후 잔존이다.

### 27.6 Draw.io 수정 권고

1. Patient Mobile을 `Device Trust + Encrypted Package Vault + Local Auth` 영역으로 변경.
2. A Edge→Mobile과 Mobile→B Edge의 굵은 암호문 데이터 경로 추가.
3. Device Registry, HandoffSession, Package/Manifest, Key Envelope·DeletionReceipt 추가.
4. 분실기기·root·backup·QR replay·무결성 실패 금지 경로 추가.
5. 기존 Cloud Relay 원격조회 경로는 대체 P0 경로로 유지.

### 27.7 다음 작성 산출물

다음 문서로 **모바일 영상 패키지 발급·저장·QR 핸드오프·B 병원 수신 업무흐름 및 유스케이스 정의서**를 작성한다. 이후 Mobile threat model, Package format·crypto profile, Device/Handoff API·데이터 상태 명세, 단일 플랫폼 P0 시험계획을 순서대로 작성한다.

---

**최종 범위 한정:** 실제 모바일 앱·기기등록·package·Handoff 구현은 현재 저장소에 없으며 본 문서는 목표 요구사항 기준선이다. 구현·시험·보안검토 전 완료 상태로 간주하지 않는다.
