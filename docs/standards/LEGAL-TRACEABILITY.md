# Highpass v3 Legal and Compliance Traceability

검토일: 2026-09-12
상태: **LEGAL REVIEW REQUIRED / TECHNICAL DESIGN MAPPING ONLY**

> 이 문서는 법률 자문, PIPA 적합성 판단, ISMS-P 인증, 병원 운영 승인이 아니다. Highpass 운영자의 법적 지위, 처리 주체, 위탁·제3자 제공, 동의 양식과 보존기간은 실제 계약·배치·업무 흐름을 바탕으로 법무 및 병원 개인정보보호책임자가 확정해야 한다.

## Official sources checked

- [개인정보 보호법 — 국가법령정보센터](https://www.law.go.kr/%EB%B2%95%EB%A0%B9/%EA%B0%9C%EC%9D%B8%EC%A0%95%EB%B3%B4%EB%B3%B4%ED%98%B8%EB%B2%95)
- [개인정보 보호법 시행령 — 국가법령정보센터](https://www.law.go.kr/%EB%B2%95%EB%A0%B9/%EA%B0%9C%EC%9D%B8%EC%A0%95%EB%B3%B4%EB%B3%B4%ED%98%B8%EB%B2%95%EC%8B%9C%ED%96%89%EB%A0%B9)
- [의료법 — 국가법령정보센터](https://www.law.go.kr/%EB%B2%95%EB%A0%B9/%EC%9D%98%EB%A3%8C%EB%B2%95)
- [의료법 제21조의2 진료기록 송부 등](https://www.law.go.kr/LSW/lsLawLinkInfo.do?chrClsCd=010202&lsId=001788&lsJoLnkSeq=1000180334)
- [의료법 제21조의3 진료기록 전송등 요청](https://www.law.go.kr/LSW/LsiJoLinkP.do?docType=JO&joNo=002103000&languageType=KO&lsNm=%EC%9D%98%EB%A3%8C%EB%B2%95&paras=1)
- [개인정보보호위원회 자료실 — 현행 안전성 확보조치·보건의료데이터 안내서](https://pipc.go.kr/np/cop/bbs/selectBoardList.do?bbsId=BS217&mCode=D010030000.Updated)

법령은 개정될 수 있으므로 production gate에서 시행일과 조문을 다시 확인한다.

## Traceability matrix

| Requirement | Legal basis candidate | Architecture control | Evidence | Test | Status |
|---|---|---|---|---|---|
| 환자가 기록 전송을 요청하거나 의료기관 요청에 동의 | 의료법 제21조의2·제21조의3 적용 가능성 | initiation type, versioned ConsentArtifact, scope/source/destination/purpose | signed/digested consent evidence, audit | consent absent/withdrawn DENY | LEGAL REVIEW REQUIRED |
| 건강·의료정보를 민감정보로 보호 | 개인정보 보호법 민감정보·안전조치 적용 가능성 | data classification, encryption, least privilege, PHI-minimized logs | config/code/test artifacts | secret/PHI leakage scan | PARTIAL TECHNICAL |
| 개인정보 처리 목적·최소수집 | 개인정보 보호법 목적 제한·최소 처리 검토 | PatientRef, metadata/payload separation, scoped package | data inventory, manifest schema | out-of-scope field rejection | PARTIAL TECHNICAL |
| 제3자 제공 또는 처리위탁 구분 | 개인정보 보호법 제공/위탁 규정 검토 | hospital/Highpass/cloud role boundary, processor map | contract/DPA/subprocessor register | organization routing test | BLOCKED — contracts |
| 목적지 병원과 제공 범위 명시 | 의료법 시행규칙 동의서/절차 검토 | source/destination/action/study scope in consent | consent version and evidence ref | Hospital C DENY | PARTIAL TECHNICAL |
| 진료기록 안전한 전송 | 의료법 제21조의2 시스템 안전조치, PIPA 안전조치 검토 | mTLS, grant, preflight, encrypted temp copy | cert/test/receipt | unauth/untrusted/expired cert DENY | PASS local mechanism only |
| 접근권한 지정·통제 | 안전성 확보조치 기준 검토 | RBAC+ABAC, tenant/hospital/resource scope | policy decision log | cross-tenant/role/scope negative | PARTIAL |
| 전송·저장 암호화 | PIPA 시행령/안전성 확보조치 검토 | TLS/mTLS, AEAD, wrapped key, no raw DEK | crypto unit evidence | tag tamper/key exposure tests | PARTIAL; real KMS blocked |
| 접속기록 보관·위변조 방지 | PIPA 시행령/안전성 확보조치, 의료법 시스템 조치 검토 | append-only audit, hash chain, restricted read | audit manifest | mutation/hash-chain negative | PASS local / WORM blocked |
| 보유기간 종료 후 파기 | 개인정보 보호법 보유·파기 검토 | configurable TTL, delete receipt, crypto-shred | lifecycle config/receipt | decrypt-after-delete DENY | NOT VERIFIED E2E |
| 환자 오매칭 방지 | 의료안전·정확성 및 개인정보 정확성 검토 | PatientMapping reconciliation, VERIFIED import gate | mapping evidence/audit | ambiguous mapping import DENY | NOT VERIFIED |
| PACS 수신본 책임 | 의료법 기록보관 및 기관 책임 검토 | destination imported copy classification, signed receipt | B policy/contract | partial/duplicate import tests | BLOCKED — hospital policy/PACS |

## Required pre-commercial decisions

- Highpass 운영자의 개인정보처리자/수탁자/공동처리자 여부
- 환자 요청과 병원 간 제공에 적용할 법적 근거·본인확인·대리인 절차
- 동의서 필수 기재, 전자서명/evidence 수준, 철회 효과와 SLA
- Cloud/monitoring/KMS 하위처리자, 국외이전, 위탁·재위탁 계약
- 유형별 보유기간과 파기 책임, B PACS 편입본의 별도 보존 의무
- 침해사고 통지·신고·증적·감사 접근 책임
- 개인정보 영향평가, 병원 보안성 심의, PIPA 법률 검토, ISMS-P 적용성

판정은 모두 `DEFERRED — PRE-COMMERCIALIZATION`, `DEFERRED — PRE-PRODUCTION` 또는 외부 자원/계약이 필요한 경우 `BLOCKED`로 유지한다.
