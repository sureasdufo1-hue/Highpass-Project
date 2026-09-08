# Capstone MVP Architecture

```text
Hospital B Browser --HTTPS--> Edge Proxy --> Portal / OHIF Viewer
                                   |
                                   v
                            Control Plane API --> PostgreSQL
                                   |
                            scoped token + mTLS
                                   v
                         Orthanc mTLS Proxy --> Hospital A Orthanc
```

- 브라우저는 Edge만 접근하며 Orthanc, PostgreSQL, mTLS proxy는 호스트 포트를 공개하지 않는다.
- Control Plane은 원본 DICOM을 지속 저장하지 않고 동의·정책·최소 메타데이터·감사로그만 관리한다.
- 서버는 역할, 병원, 목적, 기간, Study/Series와 요청 권한을 모두 확인한 뒤 단기 토큰을 발급한다.
- Gateway는 issuer, audience, 만료, 서명, 동의 상태와 scope를 다시 확인한다.
- Orthanc 연결은 별도 Gateway client 인증서가 필요한 mTLS다.
- Viewer는 Study→Series→Instance 순서로 필요한 데이터만 요청한다.
- 감사로그 수정·삭제 API는 제공하지 않으며 hash chain 무결성을 검사한다.

Orthanc 직접 접근, 인증서 없는 mTLS, 비신뢰·만료 인증서, 토큰 없는 DICOMweb, 범위 밖 Study/Series와 VIEW_ONLY 다운로드는 모두 차단 경로다. 이 구성은 실제 병원망·PACS·IdP·KMS 연결을 나타내지 않는다.
