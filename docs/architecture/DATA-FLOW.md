# Highpass 데이터 흐름

## 현행 MVP 흐름

```text
환자 동의 → Control Plane 정책검증 → 단기 DICOM Token
  → B Viewer/Edge → QIDO-RS/WADO-RS → A Edge → A Orthanc
  → 최소 메타데이터·조회·거부 감사로그
```

브라우저는 Orthanc/PostgreSQL에 직접 연결하지 않으며 전체 Study 선다운로드 대신 Study→Series→Instance 순서의 On-demand Retrieval을 사용합니다.

## Target Mobile-Core 흐름

```text
A PACS → A Edge → 승인된 암호화 Package
  → 모바일 앱 전용 Vault → 일회용 QR Handoff
  → B 의료진 OIDC/MFA + 환자 승인
  → B Edge Package 수신·무결성 검증·Key Release
  → B Viewer 또는 명시적 PACS_IMPORT → Receipt·삭제 감사
```

QR에는 PHI·DICOM·복호화 키를 넣지 않습니다. Cloud Relay는 필요한 경우 암호문과 TTL 메타데이터만 일시 중계하며 장기 원본 저장소가 아닙니다.

## 데이터 분류 원칙

| 데이터 | 저장 위치 | 원칙 |
|---|---|---|
| 원본 DICOM | A PACS/Orthanc | Control Plane 지속 저장 금지 |
| 동의·정책·토큰 digest | Control Plane DB | 최소수집·기관 범위·감사 |
| 모바일 Package | 앱 전용 암호화 Vault | 평문·일반 백업·갤러리 노출 금지 |
| Relay 객체 | 암호문 TTL 캐시 | 만료·삭제 증적 필수 |
| 감사로그 | Control Plane 및 향후 WORM/SIEM | 수정·임의 삭제 금지 |
