import {readFileSync,existsSync} from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';

// Documentation cross-reference check only, never runtime/approval validation.
const files=[
 'docs/api/highpass-v3-lifecycle-dependency-contract.md',
 'docs/api/HIGHPASS-V3-API-ALIGNMENT.md',
 'docs/architecture/HIGHPASS-V3-ARCHITECTURE-ALIGNMENT.md',
 'docs/data/highpass-v3-erd.md',
 'docs/requirements/highpass-v3-requirements-definition.md',
 'docs/security/highpass-v3-security-requirements.md',
 'docs/traceability/highpass-v3-traceability-matrix.md',
 'docs/acceptance/highpass-v3-acceptance-criteria.md',
 'docs/implementation/highpass-v3-p0-master-plan.md',
 'docs/implementation/highpass-v3-p0-06-pending-contract-prompt.md',
 'docs/api/highpass-v3-consent-pending-contract.md',
 'docs/api/highpass-v3-consent-pending-authority-contract.md',
 'docs/implementation/highpass-v3-p0-06-pending-authority-prompt.md',
 'docs/implementation/highpass-v3-p0-06-pending-persistence-prompt.md',
 'docs/implementation/highpass-v3-p0-06-pending-rls-projection-prompt.md',
 'docs/governance/highpass-v3-p0-06-pending-schema-2026-10-08.md',
 'docs/implementation/highpass-v3-p0-06-pending-atomic-write-prompt.md',
 'docs/governance/highpass-v3-p0-06-pending-projection-2026-10-08.md',
 'docs/implementation/highpass-v3-p0-06-pending-write-policy-prompt.md',
 'docs/governance/highpass-v3-p0-06-pending-audit-2026-10-08.md',
 'docs/governance/highpass-v3-p0-06-pending-write-2026-10-08.md',
 'docs/implementation/highpass-v3-p0-06-pending-adversarial-races-prompt.md',
 'docs/governance/highpass-v3-p0-06-pending-adversarial-2026-10-08.md',
 'docs/implementation/highpass-v3-p0-06-pending-transport-contract-prompt.md',
 'docs/api/highpass-v3-pending-preparation-http-contract.md',
 'docs/governance/highpass-v3-p0-06-pending-http-2026-10-08.md',
 'docs/implementation/highpass-v3-p0-06-pending-live-transport-prompt.md',
 'docs/governance/highpass-v3-p0-06-pending-live-transport-2026-10-08.md',
 'docs/implementation/highpass-v3-p0-06-pending-secure-edge-prompt.md',
 'docs/api/highpass-v3-pending-secure-edge-contract.md',
 'docs/governance/highpass-v3-p0-06-pending-secure-edge-2026-10-08.md',
 'docs/implementation/highpass-v3-p0-06-pending-proxy-pg-audit-prompt.md',
 'docs/api/highpass-v3-pending-authoritative-network-audit-contract.md',
 'docs/implementation/highpass-v3-p0-06-pending-network-provenance-prompt.md',
 'docs/governance/highpass-v3-p0-06-pending-proxy-pg-2026-10-08.md',
 'docs/implementation/highpass-v3-p0-06-pending-network-audit-persistence-prompt.md',
 'docs/governance/highpass-v3-p0-06-pending-network-provenance-2026-10-08.md',
 'docs/implementation/highpass-dpop-http-timeout-diagnostics-prompt.md',
 'docs/implementation/highpass-v3-p0-06-pending-network-audit-helper-prompt.md',
 'docs/governance/highpass-v3-p0-06-pending-network-schema-2026-10-08.md',
 'docs/implementation/highpass-v3-p0-06-pending-network-atomic-races-prompt.md',
 'docs/governance/highpass-v3-p0-06-pending-network-atomic-2026-10-08.md',
 'docs/api/highpass-v3-preauth-security-event-contract.md',
 'docs/implementation/highpass-v3-p0-06-preauth-security-sink-contract-prompt.md',
 'docs/implementation/highpass-v3-p0-06-preauth-observation-storage-prompt.md',
 'docs/governance/highpass-v3-p0-06-network-races-preauth-2026-10-08.md',
 'docs/implementation/highpass-v3-p0-06-preauth-storage-isolated-prompt.md',
 'docs/governance/highpass-v3-p0-06-preauth-observation-2026-10-08.md',
 'docs/implementation/highpass-v3-p0-06-preauth-durable-adapter-prompt.md',
 'docs/governance/highpass-v3-p0-06-preauth-storage-2026-10-08.md',
 'docs/api/highpass-v3-preauth-durable-adapter-contract.md',
 'docs/implementation/highpass-v3-p0-06-preauth-durable-adversarial-prompt.md',
 'docs/governance/highpass-v3-p0-06-preauth-durable-2026-10-08.md',
 'docs/implementation/highpass-v3-session-maximum-latency-prompt.md',
 'docs/governance/highpass-v3-session-maximum-profile-2026-10-08.md',
 'docs/implementation/highpass-v3-p0-06-preauth-outage-http-prompt.md',
 'docs/governance/highpass-v3-p0-06-preauth-adversarial-2026-10-08.md',
 'docs/api/highpass-v3-preauth-http-observation-contract.md',
 'docs/implementation/highpass-v3-p0-06-preauth-http-binding-prompt.md',
 'docs/governance/highpass-v3-p0-06-preauth-outages-2026-10-08.md',
 'docs/governance/highpass-v3-p0-06-preauth-http-binding-2026-10-08.md',
 'docs/implementation/highpass-v3-p0-06-preauth-http-outage-prompt.md',
 'docs/governance/highpass-v3-p0-06-preauth-http-outages-2026-10-08.md',
 'docs/implementation/highpass-v3-p0-06-decision-readiness-prompt.md',
 'docs/governance/highpass-v3-lifecycle-decision-packet-2026-10-08.md',
 'docs/implementation/highpass-v3-p0-06-lock-contract-audit-prompt.md',
 'docs/governance/highpass-v3-lock-contract-audit-2026-10-08.md',
 'docs/api/highpass-v3-patient-consent-command-contract.md',
 'docs/implementation/highpass-v3-p0-06-patient-approval-contract-prompt.md',
 'docs/implementation/highpass-v3-p0-06-patient-ceremony-persistence-prompt.md',
 'docs/governance/highpass-v3-patient-consent-command-2026-10-08.md',
 'docs/architecture/highpass-v3-patient-ceremony-persistence-adr.md',
 'docs/implementation/highpass-v3-p0-06-patient-projection-prompt.md',
 'docs/governance/highpass-v3-patient-ceremony-schema-2026-10-08.md',
 'docs/implementation/highpass-v3-docker-pg-start-diagnostics-prompt.md',
 'docs/governance/highpass-v3-docker-start-recovery-2026-10-08.md',
 'docs/api/highpass-v3-patient-approval-projection-contract.md',
 'docs/governance/highpass-v3-patient-approval-rls-2026-10-08.md',
 'docs/implementation/highpass-v3-p0-06-patient-guarded-projection-prompt.md',
 'docs/governance/highpass-v3-patient-guarded-projection-2026-10-08.md',
 'docs/implementation/highpass-v3-p0-06-patient-challenge-issuance-prompt.md',
 'docs/api/highpass-v3-patient-challenge-issuance-contract.md',
 'docs/api/highpass-v3-patient-consent-decision-persistence-contract.md',
 'docs/implementation/highpass-v3-p0-06-patient-consent-decision-persistence-prompt.md',
 'docs/governance/highpass-v3-patient-challenge-issuance-2026-10-08.md'
];
const errors=[],sourceHashes={};let localLinks=0;
for(const file of files){
 const body=readFileSync(file,'utf8');
 sourceHashes[file]=createHash('sha256').update(body).digest('hex');
 for(const match of body.matchAll(/\]\(([^)]+)\)/g)){
  const target=match[1].split('#')[0];
  if(!target||/^[a-z][a-z0-9+.-]*:/i.test(target))continue;
  localLinks++;
  if(!existsSync(path.resolve(path.dirname(file),target)))errors.push({file,target,code:'LOCAL_LINK_TARGET_MISSING'});
 }
}
const contract=readFileSync(files[0],'utf8');
for(let i=1;i<=6;i++)if(!contract.includes(`| D${i} `))errors.push({code:'DECISION_REGISTER_INCOMPLETE'});
for(let i=1;i<=10;i++)if(!contract.includes(`LD-${String(i).padStart(2,'0')}:`))errors.push({code:'ACCEPTANCE_SPEC_INCOMPLETE'});
for(const state of ['REQUESTED','IDENTITY_PENDING','CONSENT_PENDING','CONSENTED','AUTHORIZED','PREFLIGHT','READY','ACTIVE','VIEWING','DOWNLOADING','TRANSFERRING','MOBILE_EXPORTING','COMPLETED','REJECTED','EXPIRED','REVOKED','FAILED','CANCELLED'])
 if(!contract.includes(state))errors.push({code:'STATE_COVERAGE_LABEL_MISSING',state});
const yaml=readFileSync('docs/api/highpass-v3.openapi.yaml','utf8');
sourceHashes['docs/api/highpass-v3.openapi.yaml']=createHash('sha256').update(yaml).digest('hex');
console.log(JSON.stringify({result:errors.length?'FAIL':'PASS',scope:'DOCUMENT LINKS AND COVERAGE LABELS ONLY',files:files.length,
 localLinks,sourceHashes,errors,reviewStatus:'DRAFT',reviewer:'UNASSIGNED',
 notVerified:['link anchors','semantic OpenAPI validation','human policy approval','new clinical lifecycle/runtime tests']},null,2));
process.exitCode=errors.length?1:0;
