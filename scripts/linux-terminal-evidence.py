"""VM-side read-only commands for actual SSH terminal captures. No secret dumps."""
import sys,subprocess,json,datetime,hashlib,pathlib,shlex,time
DB='hp-capstone-control-postgres-1';APP='hp-capstone-control-control-1'
def command(args):
 print('COMMAND: '+shlex.join(args),flush=True)
 p=subprocess.run(args,text=True,capture_output=True,timeout=18)
 print(p.stdout.rstrip() or '(no stdout)',flush=True)
 if p.stderr:print('stderr: '+p.stderr[:2500].rstrip(),flush=True)
 print('exit_code='+str(p.returncode),flush=True);return p
def query(sql):
 args=['docker','exec','-i',DB,'psql','-X','-q','-P','pager=off','-P','columns=135','-v','ON_ERROR_STOP=1','-U','hipass_bootstrap','-d','hipass']
 print('COMMAND: '+shlex.join(args)+' < read-only SQL',flush=True)
 print(sql.strip(),flush=True)
 p=subprocess.run(args,input="BEGIN READ ONLY; SET LOCAL statement_timeout='5s';\n"+sql+';\nROLLBACK;',text=True,capture_output=True,timeout=15)
 print('\nRESULT:\n'+(p.stdout.rstrip() or '(no rows)'),flush=True)
 if p.returncode:print('QUERY_FAILED (details withheld)',flush=True)
 return p.returncode
def filtered(args,fn):
 print('COMMAND: '+shlex.join(args),flush=True);print('OUTPUT FILTER: public keys, addresses, identities and raw messages excluded',flush=True)
 p=subprocess.run(args,text=True,capture_output=True,timeout=18)
 if p.returncode:print('command exit_code='+str(p.returncode)+' (details withheld)');return
 fn(p.stdout)
panel=sys.argv[1]
print('Medi Q | LIVE SSH | AZURE CONTROL VM',flush=True)
print('UTC '+datetime.datetime.now(datetime.timezone.utc).isoformat(timespec='seconds'),flush=True)
print('READ-ONLY OBSERVATION | '+panel+'\n',flush=True)
if panel=='01-runtime':
 command(['docker','ps','--format','table {{.Names}}\t{{.Status}}\t{{.Image}}'])
elif panel=='02-services':
 for unit in ['docker.service','wg-quick@hp-capstone.service','hp-patient-entry.socket','hp-patient-entry.service']:
  command(['systemctl','show',unit,'--property=Id,ActiveState,SubState,ActiveEnterTimestamp'])
elif panel=='03-wireguard':
 def peers(raw):
  print('peer_alias        seconds_since_last_handshake')
  for i,line in enumerate(raw.splitlines(),1):
   stamp=int(line.split()[1]);print('peer-'+str(i)+'           '+str(int(time.time())-stamp if stamp else 'NEVER'))
 filtered(['wg','show','hp-capstone','latest-handshakes'],peers)
 command(['ip','-brief','link','show','hp-capstone'])
elif panel=='04-audit-summary':
 query("""SELECT action,result,count(*) AS events
FROM audit_logs GROUP BY action,result
ORDER BY count(*) DESC LIMIT 16""")
elif panel=='05-qr':
 query("""SELECT action,result,coalesce(reason_code,'-') AS reason,count(*) AS events
FROM audit_logs WHERE action LIKE 'TICKET_%'
GROUP BY action,result,reason_code ORDER BY count(*) DESC""")
elif panel=='06-consent':
 query("""SELECT action,result,count(*) AS events,min(created_at)::date AS first_seen,
max(created_at)::date AS last_seen FROM audit_logs WHERE action LIKE 'CONSENT_%'
GROUP BY action,result ORDER BY count(*) DESC""")
elif panel=='07-denial':
 query("""SELECT reason_code AS reason,count(*) AS events
FROM audit_logs WHERE result IN ('FAIL','DENIED','ERROR')
AND reason_code ~ '^[A-Z0-9_:-]{1,95}$'
GROUP BY reason_code ORDER BY count(*) DESC LIMIT 12""")
elif panel=='08-helper-results':
 query("""SELECT result,reason_code AS reason,count(*) AS events
FROM audit_logs WHERE action='HEALTH_HELPER_REQUEST'
GROUP BY result,reason_code ORDER BY count(*) DESC LIMIT 14""")
elif panel=='09-helper-requests':
 query("""SELECT left(md5(audit_session_id),10) AS request_alias,
min(created_at) FILTER (WHERE reason_code LIKE '%_STARTED')::time AS started_utc,
max(created_at) FILTER (WHERE reason_code NOT LIKE '%_STARTED')::time AS ended_utc,
round(extract(epoch FROM (max(created_at) FILTER (WHERE reason_code NOT LIKE '%_STARTED')
-min(created_at) FILTER (WHERE reason_code LIKE '%_STARTED')))*1000) AS elapsed_ms
FROM audit_logs WHERE action='HEALTH_HELPER_REQUEST' AND audit_session_id IS NOT NULL
GROUP BY audit_session_id ORDER BY max(created_at) DESC LIMIT 6""")
elif panel=='10-helper-metadata':
 query("""SELECT column_name,data_type,is_nullable FROM information_schema.columns
WHERE table_name='audit_logs' AND column_name='helper_metadata'""")
 query("""SELECT count(*) AS helper_logs,
count(helper_metadata) AS logs_with_metadata FROM audit_logs
WHERE action='HEALTH_HELPER_REQUEST'""")
 print('NOTE: model/KB/source metadata is captured only by the new logging path.')
elif panel=='11-helper-connection':
 command(['docker','exec',APP,'/nodejs/bin/node','--input-type=module','-e',"import {probeHelper} from '/app/src/security-helper-monitor.js'; console.log(JSON.stringify(await probeHelper(),null,2));"])
elif panel=='12-storage':
 def storage(raw):
  d=json.loads(raw)[0];m=next(v for v in d['Mounts'] if v['Destination']=='/var/lib/postgresql/data')
  print(json.dumps({'container':d['Name'],'running':d['State']['Running'],'image':d['Config']['Image'],'dbVolume':{'type':m['Type'],'source':m['Source'],'destination':m['Destination']}},indent=2))
  command(['findmnt','-T',m['Source'],'-o','SOURCE,FSTYPE,TARGET'])
 filtered(['docker','inspect',DB],storage)
elif panel=='13-db-tls':
 query("""SELECT a.backend_type,s.ssl,s.version,count(*) AS connections
FROM pg_stat_activity a JOIN pg_stat_ssl s ON a.pid=s.pid
WHERE a.client_addr IS NOT NULL GROUP BY 1,2,3""")
 query("""SELECT type,database,auth_method FROM pg_hba_file_rules
WHERE type='hostnossl'""")
elif panel=='14-plaintext-deny':
 p=command(['docker','exec','-e','PGSSLMODE=disable',DB,'psql','-X','-w','-h','127.0.0.1','-U','hipass_app','-d','hipass','-c','SELECT 1'])
 print('EXPECTED_NEGATIVE_TEST='+('PASS' if p.returncode and 'pg_hba.conf rejects connection' in p.stderr else 'NOT VERIFIED'))
elif panel=='15-hash-columns':
 query("""SELECT 'audit integrity hash' AS purpose,count(record_hash) AS present,
min(length(record_hash)) AS min_len,max(length(record_hash)) AS max_len FROM audit_logs
UNION ALL SELECT 'access token hash',count(token_hash),min(length(token_hash)),max(length(token_hash)) FROM dicom_access_token_logs
UNION ALL SELECT 'DPoP replay hash',count(proof_hash),min(length(proof_hash)),max(length(proof_hash)) FROM dpop_replay_entries
UNION ALL SELECT 'QR nonce hash',count(nonce_hash),min(length(nonce_hash)),max(length(nonce_hash)) FROM transfer_tickets""")
 print('NOTE: no hash values selected. Hashes are not encrypted patient data.')
elif panel=='16-protection-snapshot':
 def snapshot(raw):
  data=json.loads(raw);print('OPERATOR SNAPSHOT: last checked settings, not a new Azure API query')
  for c in data.get('checks',[]):print(c['id']+' | '+c['status']+' | '+c['observedAt']+'\n  '+c['summary'])
 filtered(['docker','exec',APP,'/nodejs/bin/node','-e',"process.stdout.write(require('fs').readFileSync('/run/security-protection/status.json'))"],snapshot)
elif panel=='17-system-audit':
 command(['journalctl','-t','highpass-db-tls','-t','highpass-security-detail','--since','2026-10-19','-n','8','--no-pager','-o','short-iso'])
 def waf(raw):
  print('bounded_docker_log_lines='+str(len(raw.splitlines())))
  print('raw_messages_not_displayed=true')
 filtered(['docker','logs','--since','24h','--tail','100','hp-public-web-waf-1'],waf)
elif panel=='18-real-metadata':
 query("""SELECT jsonb_pretty(helper_metadata) AS actual_request_metadata
FROM audit_logs WHERE action='HEALTH_HELPER_REQUEST'
AND reason_code='HELPER_TRANSLATION_ANSWER_GENERATED'
AND helper_metadata IS NOT NULL ORDER BY created_at DESC LIMIT 1""")
elif panel=='19-request-pair':
 query("""SELECT left(md5(audit_session_id),10) AS request_alias,created_at,
reason_code,result,(helper_metadata IS NOT NULL) AS metadata_present,
(record_hash IS NOT NULL) AS hash_present FROM audit_logs
WHERE audit_session_id=(SELECT audit_session_id FROM audit_logs
WHERE action='HEALTH_HELPER_REQUEST' AND reason_code='HELPER_TRANSLATION_ANSWER_GENERATED'
AND helper_metadata IS NOT NULL ORDER BY created_at DESC LIMIT 1)
ORDER BY created_at""")
elif panel=='26-helper-match':
 query("""SELECT left(audit_session_id,8) AS request_prefix,
left(md5(audit_session_id),10) AS evidence_alias,
to_char(created_at AT TIME ZONE 'Asia/Seoul','YYYY-MM-DD HH24:MI:SS.MS') AS event_kst,
reason_code,result FROM audit_logs
WHERE action='HEALTH_HELPER_REQUEST'
AND audit_session_id='5fbb631a-b85b-454c-847d-68ab072fb1fb'
ORDER BY created_at""")
elif panel=='27-qr-match':
 query("""SELECT 'QR-'||left(encode(sha256(convert_to(ticket_id,'UTF8')),'hex'),16) AS ticket_ref,
to_char(created_at AT TIME ZONE 'Asia/Seoul','YYYY-MM-DD HH24:MI:SS') AS event_kst,
action,result FROM audit_logs
WHERE ticket_id IN (SELECT ticket_id FROM audit_logs
 WHERE action='TICKET_REDEEMED'
 AND created_at>='2026-10-15T07:18:00Z' AND created_at<'2026-10-15T07:18:12Z')
AND action IN ('TICKET_ISSUED','TICKET_REDEEMED','TICKET_REVOKED','TICKET_DENIED')
ORDER BY created_at LIMIT 12""")
else:raise SystemExit('UNKNOWN_PANEL')
print('\n[OBSERVATION COMPLETE] '+datetime.datetime.now(datetime.timezone.utc).isoformat(timespec='seconds'),flush=True)
