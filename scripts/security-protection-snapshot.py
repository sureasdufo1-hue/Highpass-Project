"""Build an operator-reviewed, metadata-only snapshot; upload through pinned SSH."""
import pathlib,json,importlib.util
ROOT=pathlib.Path(__file__).resolve().parents[1];Q=pathlib.Path.home()/'Downloads'/'MediQ_관제증적_20261020'/'queries'
def read(name):return json.loads((Q/(name+'.json')).read_text(encoding='utf8'))
r=read('runtime');d=read('disk');v=read('vault');roles=read('vaultRoles');diag=read('vaultDiagnostics')
checks=[]
def add(id,status,time,summary,source):checks.append(dict(id=id,status=status,observedAt=time,summary=summary,source=source))
add('storage','PASS',r['observedAt'],f"Azure VM 내부 PostgreSQL {r['storage']['version']} 컨테이너. DB 볼륨은 OS 디스크의 ext4 파일시스템에 저장됩니다.",'VM/Docker/findmnt 읽기 전용 조회')
add('disk','PASS' if d['data'].get('encryption',{}).get('type')=='EncryptionAtRestWithPlatformKey' else 'UNKNOWN',d['observedAt'],'OS 디스크는 Azure 플랫폼 관리 키로 암호화됩니다. 별도 Key Vault의 고객 관리 키로 DB 디스크를 암호화하는 구성은 아닙니다.','Azure 관리 디스크 암호화 설정')
add('fields','REVIEW',r['observedAt'],'토큰·재사용 방지·감사 무결성 해시 컬럼을 확인했습니다. 이번 컬럼명·코드 확인 범위에서 필드 암호문과 비밀번호 해시 컬럼 저장 증거는 확인하지 못했습니다. 감사 해시는 데이터 암호화가 아닙니다.','DB 스키마·컬럼 존재/길이 집계')
vault=v['data'];add('vault','PASS' if vault.get('rbac') and vault.get('publicNetwork')=='Disabled' and vault.get('purgeProtection') else 'REVIEW',v['observedAt'],f"리전 {vault.get('location')}. RBAC {vault.get('rbac')}, 공개 네트워크 {vault.get('publicNetwork')}, 제거 보호 {vault.get('purgeProtection')}. 병원 키 보호용이며 DB 디스크 키와 용도가 다릅니다.",'Azure Key Vault 설정')
add('roles','REVIEW',roles['observedAt'],'병원 키 범위에 A Wrap Only·B Unwrap Only 역할이 있습니다. 상위 범위 Owner 권한도 상속됩니다. 계정·주체 ID는 표시하지 않습니다.','Key Vault 키 범위 역할 및 상속 조회')
add('diagnostics','PASS' if diag['status']=='PASS' else 'UNKNOWN',diag['observedAt'],'Key Vault 진단 설정의 로그 범주 및 작업 공간 연결을 조회했습니다. 수집 설정은 전체 로그 수신 성공과 구분합니다.','Azure 진단 설정 조회')
snapshot={'schemaVersion':1,'checks':checks};folder=ROOT/'artifacts/azure/security-detail-20261020';(folder/'protection-snapshot.json').write_text(json.dumps(snapshot,ensure_ascii=False,indent=2),encoding='utf8')
s=importlib.util.spec_from_file_location('r',ROOT/'scripts/health-helper-runtime-check.py');rt=importlib.util.module_from_spec(s);s.loader.exec_module(rt);c=rt.connect('CLOUD',None)
try:
 with c.open_sftp() as ftp:ftp.put(str(folder/'protection-snapshot.json'),'/home/highpassadmin/.security-protection-snapshot.json');ftp.chmod('/home/highpassadmin/.security-protection-snapshot.json',0o600)
 result=rt.remote(c,'CLOUD',None,r'''
import pathlib,json,os
base=pathlib.Path('/opt/highpass/security-detail-20261020');folder=base/'control';base.chmod(0o711);folder.chmod(0o711)
raw=pathlib.Path('/home/highpassadmin/.security-protection-snapshot.json').read_bytes();v=json.loads(raw);assert v['schemaVersion']==1 and len(v['checks'])==6
target=folder/'protection-status.json';target.write_bytes(raw);target.chmod(0o644)
config=json.loads((folder/'after.json').read_text());app=config['services']['control'];assert not any(m.get('target')=='/run/security-protection/status.json' for m in app['volumes'])
app['volumes'].append({'type':'bind','source':str(target),'target':'/run/security-protection/status.json','read_only':True})
(folder/'after.json').write_text(json.dumps(config));(folder/'after.json').chmod(0o600)
print(json.dumps({'checks':len(v['checks']),'readOnlyMount':True}))
''',25)
 print(json.dumps(result))
finally:c.close()
