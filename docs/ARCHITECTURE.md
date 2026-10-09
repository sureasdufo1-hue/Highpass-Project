# Capstone MVP Architecture

> 이 문서는 현재 실행 가능한 Capstone MVP 구조를 설명한다. Highpass v3 목표 객체·데이터·API 계약은 [v3 Architecture Alignment](architecture/HIGHPASS-V3-ARCHITECTURE-ALIGNMENT.md), [v3 Logical ERD](data/highpass-v3-erd.md), [v3 API Alignment](api/HIGHPASS-V3-API-ALIGNMENT.md)을 참조한다. v3 문서는 아직 구현·운영 승인을 의미하지 않는다.

## 실제 분산 시연 배치 — 2026-10-09 KST

```text
B VM protocol client --private HTTPS--> A VM authorized Gateway --mTLS--> A Orthanc
                                           |
                                    metadata authorization / ready audit
                                           |
                                      private HTTPS
                                           v
                            Azure Control API --> private PostgreSQL
```

Azure는 실제로 메타데이터 정책 API·DB·사설 TLS를 실행하며 영상/Viewer 경로를
차단한다. A Gateway는 기존 병원 PACS 저장소를 유지하고10.90.88.2:9443에만
노출된다. WireGuard cloud host는 암호화된 패킷의 라우터이며, 의료영상이 Control
API에 저장되거나 응용 계층에서 프록시되는 구조가 아니다.

실제 B→A→Azure 합성 프로토콜 검증에서 신규 환자 동의·서명된 개발용 인증·DPoP
바인딩 단기 토큰·범위 내 WADO·재사용/범위 밖/철회 차단·감사 hash chain이 확인됐다.
B 브라우저 Viewer, 실제 Key Vault 암호화, 전체 신규 v3 Grant/HA 완료는 아직 아니다.
향후 B 동일 출처 UI 주소는 https://192.168.111.149:9443이며 API와 Gateway의
DPoP 공개 URL 계약도 이 주소로 정렬했다. 현재 프로토콜 테스트는 이 계약을
시뮬레이션하며 실제 브라우저 진입점 배포/검증을 대신하지 않는다.

## 기존 로컬 Compose 경로 (분산 Azure 배포 증적과 구분)

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

## Workstation hospitals + Azure capstone target — 2026-10-08

User-approved target: hospital A/B on local Workstation Pro, Azure for Students for
cloud Control Plane and real Key Vault. The monolithic local Compose above remains
available; it is NOT evidence that this distributed target already runs.

| Placement | Responsibility | Current status |
|---|---|---|
| New A Ubuntu VM, 2vCPU/8GiB | Synthetic originals, private Orthanc, authorized Data Plane Gateway, AES-GCM packaging | VMX/Compose foundation only |
| New B Ubuntu VM, 2vCPU/8GiB | Authorized receiving Gateway, transient decryption, authenticated Viewer ingress | VMX/internal Viewer foundation only |
| Azure Japan East | Consent/policy/minimum metadata/audit API and DB, not persistent original DICOM | Cloud VM/Docker foundation provisioned; API/DB not deployed |
| Azure Key Vault | Versioned RSA-OAEP-256 key protection | Vault created; key operations NOT VERIFIED |

Latest read-only checkpoint, 2026-10-08: the user-selected existing A/B guests have
2vCPU/4GiB each and use VMnet8, at `192.168.111.129` and `192.168.111.149`.
The 8GiB VMnet20/21 templates below remain proposals and were not applied to these
guests. Earlier interactive A installation/diagnostics timed out and are preserved
as failed/unverified evidence. After explicit automated credential authorization,
both guests installed Docker 29.8.2 and Compose v5.6.0 successfully. B's cloned
SSH host keys were backed up root-only and rotated; its new key was independently
read through the trusted local VMware management channel before strict SSH
reconnection/MAC verification. No host verification bypass or password in argv
was used. A now runs two Healthy Orthanc/mTLS foundation containers; this is not
patient-authorized cross-VM application completion. Positive/negative VM mTLS,
synthetic seeding, authorized Gateways and B Viewer ingress remain required.
The Windows Docker Engine is 29.8.0 and the existing `highpass-phase2` Compose stack
reports six running containers; this is a local baseline, not the distributed target.
The student subscription is Enabled, with total regional CPU quota 6 and B-family
quota 4. Key Vault public access is Disabled and RBAC enabled. The network deployment
`highpass-capstone-network-20261008` Succeeded: its private endpoint is Approved and
private DNS maps `kv-hp-demo-4869edd9.vault.azure.net` to `10.89.1.4` inside the linked
VNet. Network IaC and next steps are in [infra/azure](../infra/azure/README.md).
Local VPN/DNS forwarding and real key operations remain NOT VERIFIED.

Cloud host deployment `highpass-capstone-cloud-vm-20261008` is Succeeded and running
on Standard_B2als_v2 (2vCPU/4GiB), private address 10.89.0.4. Azure management-channel
host-key verification preceded strict SSH login. Docker 29.8.2 and Compose v5.6.0
are installed. From this VM, the ordinary Vault TLS hostname resolves to private
10.89.1.4 and returns 401 without credentials, with successful TLS verification.
This does not prove any key operation. The VM has no Key Vault identity or role;
the narrow public /32 NSG is not proof of local-VM VPN connectivity. WireGuard
tools are installed but no tunnel is active or verified. No API/DB is deployed yet.

Host observation: 63.8GiB RAM, 8 logical processors, approximately1001GiB free on C,
Workstation vmrun installed and read-only list successful, zero running guests at
the earlier initial inspection (superseded by the A/B checkpoint above). Existing
training/SOC VMs and VMnet1/8/10 were not modified. Firmware
virtualization flag false with HypervisorPresent true is ambiguous; actual guest boot
is required, not an instruction to disable Hyper-V/WSL/Docker.

New VM templates `infra/workstation/hospital-a.vmx` and `hospital-b.vmx` reference
future VMnet20 and VMnet21, no bridged/NAT second NIC by default, no clipboard/shared
folders. They are NOT installed guests: each still needs an independently provisioned
64GiB sparse disk, verified Ubuntu24.04 LTS image, SSH keys outside Git, and OS installation.
Do not register/start the repository template directly or reuse an unrelated VM.
VMnet20/21, DHCP/static addresses and routes must be provisioned after collision checks.
Candidate subnets10.88.20.0/24 and10.88.21.0/24 are proposals, not assigned addresses.

Existing Control API also proxies DICOM; moving that process unchanged to Azure would
still relay image bytes through the cloud. A separately authorized Data Plane path
and metadata/policy-only cloud wiring must precede a distributed completion claim.
A mTLS proxy is transport authentication, not consent/user/scope authorization.
The new A profile publishes only a loopback mTLS listener; B publishes no bare Viewer.
Same-origin Viewer configuration, authenticated B ingress and the authorized A Gateway
remain pending; the current localhost Viewer config is deliberately not represented
as a working cross-VM route.

Key Vault public access stays Disabled. Local VMs need a reviewed VPN/overlay route
to a VNet private endpoint and correct private DNS; creating a private endpoint alone
does not connect an on-premises VM. No managed Azure VPN Gateway is provisioned without
checking its cost against USD100. A small cloud relay/overlay VM is a candidate, not
a deployed or audited VPN. Local Gateways cannot assume an Azure VM managed identity;
dedicated certificate-based Entra service principals or a reviewed Data Plane key broker
must be selected and least-privilege tested. Control API must never receive raw DEK.
See [Key Vault authentication](https://learn.microsoft.com/en-us/azure/key-vault/general/authentication)
and [private connectivity/DNS](https://learn.microsoft.com/en-us/azure/key-vault/general/private-link-diagnostics).

Related FR:014~020 authorization,021~025 tokens,026~031 Gateway,032~036 Viewer,
037~041 audit. Foundation tests do not complete these requirements. New evidence
DRAFT / UNASSIGNED; whole distributed MVP/v3 NOT VERIFIED.

### Later verified progress — 2026-10-08

A VM now passes actual authorized mTLS plus six certificate-negative cases,
four-instance synthetic seed and QIDO-RS200 with exact three synthetic Studies.
The missing explicit DICOMweb plugin load was fixed without recreating PACS data.
See the cloud/Workstation checkpoint; this supersedes the earlier outstanding
mTLS/seeding statements above only.

The additive `/gateway/data-plane/authorize` legacy internal route now provides
metadata-only policy decisions to a dedicated source-bound Gateway principal.
It reuses token, DPoP replay, live consent and RBAC/ABAC policy, and never invokes
Orthanc. Its local HTTP gate passed; the standalone A Gateway, scoped forwarding,
completion auditing, private TLS cloud deployment and B Viewer wiring remain
unimplemented/unverified. This does not activate new v3 Grant APIs or prove that
the existing monolithic `/dicomweb` path has been disabled in the cloud.

Subsequent code gate: the standalone A HTTPS Gateway/policy client/private mTLS
PACS retrieval is implemented with exact QIDO Study/Series filtering and bounded
single-instance/frame buffering. It reports signed response-preparation receipts
to the metadata-only Control API and rechecks live authorization before releasing
bytes. Audit preparation is NOT Viewer delivery completion. Cloud-only configuration
now rejects legacy image/import/export operations. These supersede the preceding
"unimplemented" code statements only; VM deployment, private service TLS/VPN,
actual Gateway-to-PACS E2E and B Viewer integration remain NOT VERIFIED.

Subsequent actual infrastructure gate: A10.90.88.2/B10.90.88.3/cloud10.90.88.1
WireGuard overlay is active and verified. Both local VMs reached private Key Vault
10.89.1.4 with strict ordinary-hostname TLS and explicit private resolution (401).
Two authenticated handshakes and an exact raw-PACS DROP counter were verified.
This supersedes prior VPN-outstanding statements only: automatic container DNS,
real key operations, cloud metadata API/PG deployment, A Gateway and B Viewer
remain outstanding. The existing cloud VM routes network Data Plane packets;
the Control API must still be metadata-only, never image-persistent.
