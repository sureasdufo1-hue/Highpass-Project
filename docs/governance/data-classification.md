# Data Classification

| Classification | Examples | Current PoC Handling |
|---|---|---|
| Public | public docs | allowed in repository |
| Internal | architecture docs, runbooks | repository controlled |
| Confidential | operational evidence, audit summaries | avoid unnecessary exposure |
| Sensitive Security Material | private keys, DB passwords, bearer tokens | prohibited in Git |
| Health / Medical Information | real patient data, real DICOM PHI | PROHIBITED / NOT USED |
| Authentication Secret | JWT secret, KMS credential, DB credential | environment/secret only |
| Audit Evidence | access logs, risk approvals, hosted CI evidence | restricted and integrity protected |

Synthetic DICOM and synthetic patient records are used only for PoC testing. Real patient data remains prohibited.
