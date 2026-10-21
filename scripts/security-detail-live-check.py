"""Strict-TLS component checks; metadata insert is rolled back, no fabricated event retained."""
import pathlib,json,importlib.util,urllib.request,hashlib
ROOT=pathlib.Path(__file__).resolve().parents[1];s=importlib.util.spec_from_file_location('r',ROOT/'scripts/health-helper-runtime-check.py');r=importlib.util.module_from_spec(s);s.loader.exec_module(r);c=r.connect('CLOUD',None)
try:
 result=r.remote(c,'CLOUD',None,r'''
import subprocess,json,re
js=r"""import fs from 'node:fs';import pg from 'pg';import {randomUUID} from 'node:crypto';
import {postgresTlsOptions} from '/app/src/postgres-tls.js';import {protectionStatus} from '/app/src/security-protection-status.js';import {buildAuditLog} from '/app/src/services.js';import {PostgresStore} from '/app/src/postgres-store.js';import {buildEventIndex,parseEventQuery} from '/app/src/security-console.js';
const e=process.env,url=`postgres://${encodeURIComponent(e.POSTGRES_USER)}:${encodeURIComponent(fs.readFileSync(e.POSTGRES_PASSWORD_FILE,'utf8').trim())}@${e.POSTGRES_HOST}/${e.POSTGRES_DB}`;
const client=new pg.Client({connectionString:url,...postgresTlsOptions(url),connectionTimeoutMillis:5000,query_timeout:5000});await client.connect();const store=new PostgresStore(url);store.client=client;const out={};
try{const p=await protectionStatus(store);if(p.database.status!=='PASS'||p.snapshot.checks.length!==6)throw Error('PROTECTION_NOT_READY');out.protection={database:p.database.status,tls:p.database.version,snapshotChecks:p.snapshot.checks.length};
const id='audit-check-'+randomUUID(),date=new Date().toISOString(),input={auditSessionId:'security-metadata-transaction-check',actorType:'SYSTEM',actorId:'tls-metadata-check',action:'HEALTH_HELPER_REQUEST',result:'SUCCESS',reasonCode:'HELPER_TRANSLATION_EVIDENCE_DELIVERED',helperMetadata:{corpusVersion:'TRANSACTION_TEST_ONLY',sourceIds:['fixture-source'],generationUsed:false,fallbackUsed:true}};
const log=buildAuditLog(input,null,date,id);await client.query('BEGIN');try{await store.insertAuditLogs([log],client);const row=(await client.query('SELECT helper_metadata FROM audit_logs WHERE audit_id=$1',[id])).rows[0];if(row.helper_metadata.corpusVersion!=='TRANSACTION_TEST_ONLY')throw Error('METADATA_PERSISTENCE');const round=buildAuditLog({...input,helperMetadata:row.helper_metadata},null,date,id);if(round.recordHash!==log.recordHash)throw Error('HASH_ROUNDTRIP');}finally{await client.query('ROLLBACK');}
if(Number((await client.query('SELECT count(*) n FROM audit_logs WHERE audit_id=$1',[id])).rows[0].n)!==0)throw Error('TEST_EVENT_RETAINED');out.metadataPersistenceRollback='PASS';out.metadataHashRoundtrip='PASS';
const events=(await client.query("SELECT audit_id AS \"auditId\",audit_session_id AS \"auditSessionId\",ticket_id AS \"ticketId\",action,result,reason_code AS \"reasonCode\",created_at AS \"createdAt\",helper_metadata AS \"helperMetadata\" FROM audit_logs WHERE action LIKE 'TICKET_%' OR action='HEALTH_HELPER_REQUEST' ORDER BY created_at DESC LIMIT 3000")).rows.map(r=>({...r,createdAt:r.createdAt.toISOString()}));const absent={status:'unavailable',events:[]};const index=buildEventIndex(events,absent,[],parseEventQuery(new URLSearchParams('hours=744')),absent,absent);out.actualStoredLogProjection={helperRequests:index.helperRequests.total,qrLogs:index.qrLifecycle.logCount,linkedTickets:index.qrLifecycle.groups.length};
const db=(await client.query("SELECT pg_postmaster_start_time() started,(SELECT json_agg(t) FROM (SELECT pid,application_name,state FROM pg_stat_replication)t) replication")).rows[0];out.databaseStart=db.started;out.replication=db.replication;console.log(JSON.stringify(out));
}finally{await store.dpopReplayStore.pool.end();await client.end();}"""
p=subprocess.run(['docker','exec','hp-capstone-control-control-1','/nodejs/bin/node','--input-type=module','-e',js],text=True,capture_output=True,timeout=35)
if p.returncode:
 print(json.dumps({'status':'FAIL','safeErrorCodes':re.findall(r"(?:Error: |code: ')([A-Z][A-Z0-9_]{3,80})",p.stderr),'moduleNotFound':'ERR_MODULE_NOT_FOUND' in p.stderr}))
else:print(p.stdout)
''',45)
finally:c.close()
candidate=ROOT/'artifacts/azure/security-detail-mobile-20261020/web/public/ui/security-console.css'
if candidate.exists():
 raw=urllib.request.urlopen('https://highpass-demo.japaneast.cloudapp.azure.com/ui/security-console.css',timeout=20).read()
 result['publicCssMatchesStagedCandidate']=hashlib.sha256(raw).digest()==hashlib.sha256(candidate.read_bytes()).digest()
(ROOT/'artifacts/azure/security-detail-20261020/live-component-check.json').write_text(json.dumps(result,indent=2),encoding='utf8');print(json.dumps(result))
