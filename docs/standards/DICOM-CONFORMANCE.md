# DICOM Standards Mapping and Conformance Boundary

검토일: 2026-09-12
상태: **DESIGN MAPPING / CONFORMANCE NOT VERIFIED**

## Official references checked

- [DICOM PS3.18 2026c — Web Services](https://dicom.nema.org/medical/dicom/current/output/html/part18.html)
- [DICOM PS3.15 2026c — Security and System Management Profiles](https://dicom.nema.org/medical/dicom/current/output/html/part15.html)
- [DICOM current edition landing page](https://www.dicomstandard.org/current)

검토 시점의 `current` 공식 HTML은 2026c를 표시했다. DICOM은 갱신되므로 구현 release마다 edition을 기록하고 conformance statement를 재검토한다.

## Responsibility separation

| Layer | Standard role | Highpass responsibility | Current status |
|---|---|---|---|
| DICOM Object | Patient/Study/Series/Instance, SOP Class, Transfer Syntax, UID | UID type/format, object set, identity and compatibility validation | PARTIAL |
| PS3.18 | HTTP 기반 DICOMweb resource/transaction; QIDO/WADO/STOW | query/retrieve/store request and media type behavior | QIDO/WADO local; STOW NOT VERIFIED |
| PS3.15 | secure transport, audit trail, confidentiality, signatures and related profiles | TLS/mTLS, audit mapping, de-identification/security mechanism selection | PARTIAL; no conformance claim |
| Highpass Control | consent, ABAC, TransferGrant, tenant, route | PS3.18 밖의 product authorization policy | Highpass-specific |

PS3.18 자체는 access control·authorization·auditing을 완결하지 않는다. 따라서 QIDO/WADO/STOW 동작만으로 Highpass 보안 준수를 주장할 수 없고, PS3.15 메커니즘과 별도 조직 정책·법률 통제가 함께 필요하다.

## DICOMweb baseline

| Service | v3 use | Security gate | Evidence state |
|---|---|---|---|
| QIDO-RS | selected Study/Series/Instance discovery | tenant, consent, grant, UID scope, mTLS to source | IMPLEMENTED locally |
| WADO-RS | Viewer/authorized object/frame retrieval | same + no URL token + cache policy | PARTIAL |
| STOW-RS | destination B PACS import | VERIFIED patient mapping, preflight, import grant, idempotency, receipt | NOT VERIFIED |
| C-STORE | legacy B Connector internal fallback only | institution-approved AE/mTLS boundary and same import policy | FUTURE/conditional |

## Integrity rules

- BIT_PRESERVING: source object hash, transmitted object hash, destination object hash와 SOP identity를 함께 비교한다.
- TRANSCODED: file hash 불일치는 정상일 수 있다. SOP identity, decoded semantic/object validation, Transfer Syntax 변화, 변환 도구·시간·정책·결과를 provenance에 기록한다.
- 어느 경우에도 단순 `HTTP 200`, STOW 성공 코드, 동일 UID만으로 integrity PASS를 선언하지 않는다.
- 변조, 누락, duplicate conflict, unsupported SOP/Transfer Syntax는 격리 또는 DENY하며 object별 결과를 receipt에 기록한다.

## PS3.15 security profile roadmap

| Mechanism/profile area | v3 mapping | Claim |
|---|---|---|
| Secure transport connection | Connector↔Cloud↔Connector mTLS, hostname/SAN/EKU/chain/expiry | local mechanism present; profile conformance NOT VERIFIED |
| Audit trail message | Highpass AuditEvent를 DICOM/IHE event 의미와 매핑 | proprietary schema now; transport/profile NOT VERIFIED |
| Attribute confidentiality | 연구/AI Privacy Filter와 DICOM de-identification boundary | real DICOM conformance NOT VERIFIED |
| Digital signature/integrity | provenance, hashes, signed receipts 후보 | DICOM Digital Signature profile NOT IMPLEMENTED |
| Time synchronization | event/receipt ordering | external trusted time NOT VERIFIED |

## Conformance statement rule

공식 DICOM Conformance Statement, supported SOP Classes/Transfer Syntaxes, error/media-type behavior, vendor PACS 상호운용 시험이 없으므로 현재 표현은 `DICOMweb-compatible local MVP`까지로 제한한다. `DICOM compliant`, `PS3.15 compliant`, 실제 PACS interoperable은 사용하지 않는다.
