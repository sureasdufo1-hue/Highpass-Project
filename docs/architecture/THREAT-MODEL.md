# Highpass 통합 위협모델

상태: **MVP 초안 / 승인 대기**

## 자산과 경계

동의·정책·토큰·DICOM 메타데이터·PACS 원본·감사로그·가명 매핑·모바일 Package·DEK를 보호합니다. 브라우저/모바일은 반신뢰 운반매체이며, PACS 원본은 A 병원 경계에 남습니다.

## 위협과 통제

| 위협 | 통제 |
|---|---|
| Principal·병원 위조 | 서버 principal 정규화, JWT issuer/audience/expiry 검증 |
| 동의·scope 우회 | 동의 상태·기간·병원·의료진·목적·Study/Series·행위 재검증 |
| 토큰 변조·재사용 | 서명·jti·TTL·digest·철회 검증 |
| PACS 직접 노출 | Private network, Edge/Gateway 경유, mTLS |
| QR 복제·재사용 | opaque 일회용 Ticket, 원자적 소비, 환자 승인과 의료진 인증 결합 |
| 모바일 분실·루팅 | Device 상태 차단, 앱 전용 암호화 Vault, 키 릴리스 재검증 |
| Package 변조 | Manifest/Chunk hash, AES-GCM tag, nonce 고유성 검증 |
| 로그 변조·누락 | append-only API, hash chain, 허용행위의 감사 실패 처리 |
| Relay 평문 유출 | 암호문 중계·TTL 캐시, DEK 접근 금지 |

## 미종결 위험

실제 IdP/MFA, KMS/HSM, WORM/SIEM, 모바일 OS 보안영역, 실제 PACS, DR, 외부 침투시험, 고위험 영상 defacing은 `NOT VERIFIED` 또는 `BLOCKED`입니다.
