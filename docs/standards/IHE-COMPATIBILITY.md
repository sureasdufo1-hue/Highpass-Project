# IHE Radiology Compatibility Roadmap

검토일: 2026-09-12
상태: **ROADMAP / IHE CONFORMANCE NOT CLAIMED**

공식 기준: [IHE Radiology Technical Framework](https://profiles.ihe.net/RAD/). 검토 시 공식 페이지는 Revision 23.0(2025-08-08)을 게시하고, XDS-I는 XDS-I.b로 대체되었으며 XDS-I.b, XCA-I, WIA를 현행 프로파일 목록에 포함한다.

| Profile | Relevance | v3 decision | Missing before claim |
|---|---|---|---|
| XDS-I.b | 기관 간 영상 manifest/document sharing | COMPATIBLE BY DESIGN | actors, registry/repository transactions, metadata mapping, Connectathon-style tests |
| XCA-I | community 간 imaging query/retrieve | FUTURE | community/gateway governance, homeCommunityId, cross-community policy/tests |
| WIA | web-based image access | COMPATIBLE BY DESIGN / FUTURE VALIDATION | actor/transaction mapping and normative test evidence |
| ATNA-related audit/security use | secure node/application audit concepts | REVIEW | audit message/transport profile mapping and time sync evidence |

Highpass는 IHE를 대체하지 않는다. Highpass-specific 영역은 PatientRef/Mapping, ExchangeSession, ConsentArtifact, AuthorizationDecision, TransferGrant, route policy, Mobile Vault다. Registry/repository/community actors가 없는데 XDS-I.b 또는 XCA-I 준수를 주장하지 않는다.

## Compatibility constraints

1. DICOM Study/Series/Instance/SOP semantics를 proprietary identifier로 대체하지 않는다.
2. External IHE actor를 추가해도 Consent/Grant gate를 우회하지 않는다.
3. ImagingPackage manifest는 향후 XDS-I.b metadata adapter를 둘 수 있게 route-neutral하게 유지한다.
4. Provenance는 IHE/DICOM audit 이벤트로 export할 수 있으나 내부 법적 증거와 표준 audit message를 동일시하지 않는다.
5. 프로파일·edition·actor·transaction·option을 명시한 시험 전에는 `compatible by design`을 넘는 표현을 금지한다.
