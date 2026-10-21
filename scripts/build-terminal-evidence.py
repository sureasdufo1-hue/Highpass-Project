"""Annotate untouched native terminal screenshots with separate HTML layers."""
import pathlib,json,html,struct,hashlib,zipfile,sys
root=pathlib.Path.home()/'Downloads'/'MediQ_리눅스터미널_증적_20261020'
recovery=len(sys.argv)>1
if recovery:root=pathlib.Path(sys.argv[1])
entries=[
('01-runtime','VM에서 실행 중인 서비스','Docker 컨테이너 실행 상태와 이미지 기준을 확인합니다. healthy는 해당 컨테이너의 헬스 체크 결과이며 전체 업무 흐름의 성공을 뜻하지 않습니다.','DB는 Azure 관리형 PostgreSQL이 아니라 이 VM의 PostgreSQL 컨테이너입니다.'),
('02-services','리눅스 서비스 상태','systemctl에서 Docker, WireGuard, 환자 영상 진입 서비스의 ActiveState·SubState를 읽습니다.','소켓 활성화 서비스는 요청이 없을 때 본체가 inactive일 수 있습니다. 소켓 상태와 함께 판단합니다.'),
('03-wireguard','병원 연결 터널 상태','피어 1은 마지막 핸드셰이크 후 89초, 피어 2는 293,376초가 경과했습니다. 터널 인터페이스는 UP입니다. 공개키·주소는 제외했습니다.','피어 2는 최근 통신 확인이 필요합니다. 오래된 핸드셰이크만으로 장애를 단정하거나 A·B 어느 병원인지 추정하지 않습니다. 이번 촬영은 Control VM 측 관측입니다.'),
('04-audit-summary','서버 DB에 저장된 감사기록','화면 집계가 아니라 audit_logs 테이블을 읽기 전용 SQL로 직접 집계한 결과입니다. 상위 16개 조합만 표시합니다.','보관 중인 전체 기간 기록입니다. 허용·실패 이벤트는 시연과 시험을 포함하며 공격 건수와 동일하지 않습니다.'),
('05-qr','QR 티켓 생애주기 기록','TICKET 계열 발급·접수·철회·교체·거부 기록을 서버 DB에서 조회합니다. QR 값이나 연결 코드는 조회하지 않습니다.','철회는 티켓의 무효화입니다. 물리적 삭제나 QR 코드 원문 보관을 의미하지 않습니다.'),
('06-consent','환자 동의 처리 기록','동의 생성·조회·철회 기록과 최초·최근 발생일을 확인합니다. 환자 식별자는 제외했습니다.','동의 상태와 QR 티켓 상태는 별개입니다. 이 집계는 과거 처리 이력이며 현재 모든 동의가 유효하다는 의미가 아닙니다.'),
('07-denial','접근 거부 사유','서버가 남긴 실패·거부 사유별 상위 12개 건수입니다. 내부 코드로 검증 단계의 문제를 찾습니다.','DPoP 누락·재사용, 계정 연결 불일치 등은 추가 확인이 필요한 결과입니다. 코드만으로 공격 의도를 판정하지 않습니다.'),
('08-helper-results','건강도우미 처리 결과','건강도우미 요청 감사로그를 결과와 사유 코드로 집계합니다. 질문·답변 원문은 표시하지 않습니다.','SSH 연결 실패 및 대체 안내 이력과 실제 모델 생성 성공은 구분해서 읽어야 합니다.'),
('09-helper-requests','요청 시작·종료와 처리 간격','동일 감사 세션의 시작·종료 이벤트를 연결한 최근 6개 요청입니다. 요청 식별자는 표시용 해시 별칭으로 대체했습니다.','표는 시각만 표시하며 촬영 당일 요청이라는 뜻이 아닙니다. elapsed_ms는 두 감사 이벤트 간격으로, 순수 모델 추론 시간과 다릅니다. 한쪽 이벤트가 없으면 산출되지 않습니다.'),
('10-helper-metadata','모델·근거 메타데이터 기록 범위','helper_metadata JSONB 컬럼은 존재합니다. 건강도우미 로그 242건 중 메타데이터 값이 기록된 로그는 현재 0건입니다.','모델 버전·근거 ID가 실제로 수집됐다고 설명할 수 없습니다. 과거 기록에 추정값을 채우지 않으며 새 수집 경로의 요청 검증이 필요합니다.'),
('11-helper-connection','SSH·모델 연결 점검','실제 점검 결과 transport=UNAVAILABLE, relay=UNKNOWN, model=UNKNOWN입니다. 모델 답변 생성이나 환자 데이터 전송은 수행하지 않았습니다.','현재 연결 정상 판정은 FAIL입니다. 이 캡처는 장애 상태의 증거이며 실제 모델 생성 성공의 증거가 아닙니다.'),
('12-storage','DB의 실제 저장 위치','Docker 마운트와 findmnt 결과로 PostgreSQL 데이터 볼륨이 어떤 파일시스템에 연결되는지 확인합니다.','ext4 또는 마운트 경로만으로 암호화를 입증하지 않습니다. Azure 디스크 저장 암호화 설정과 함께 확인해야 합니다.'),
('13-db-tls','DB 통신 TLS와 차단 규칙','pg_stat_ssl에서 현재 TCP 세션의 TLS 적용 여부·버전을 확인하고 hostnossl 거부 규칙을 함께 읽습니다.','조회 시점의 연결에 대한 관측입니다. 로컬 Unix 소켓은 TCP TLS 집계 대상이 아니며 DR 등은 표시된 세션 범위로 판단합니다.'),
('14-plaintext-deny','비TLS TCP 접속 거부','비밀번호 없이 sslmode=disable로 접속을 시도한 제한된 부정 시험입니다. SELECT는 연결 단계에서 차단돼 실행되지 않습니다.','EXPECTED_NEGATIVE_TEST=PASS는 비TLS 접속 차단 시험의 성공입니다. 데이터 조회 성공이나 장애가 아닙니다.'),
('15-hash-columns','무결성·토큰·재사용 방지 해시','감사 무결성, 접근토큰, DPoP 재사용 방지, QR nonce의 해시 보관 건수와 길이만 조회합니다. 해시 원문은 출력하지 않습니다.','해시는 복호화하는 데이터 암호문이 아닙니다. 비밀번호 해시 또는 환자 데이터의 필드 암호화라고 설명하면 안 됩니다.'),
('16-protection-snapshot','서버에 연결된 보호 설정 조회본','서버에 읽기 전용으로 연결된 운영자 점검 스냅샷입니다. 디스크·Vault·접근권한 등의 마지막 확인 시각과 내용을 보여줍니다.','이번 명령이 Azure API를 새로 호출한 것은 아닙니다. 디스크 SSE와 Key Vault 기반 특정 키 연산을 구분합니다.'),
('17-system-audit','시스템 작업 이력과 로그 관측','지정된 TLS·관제 작업 태그의 journal 기록과 제한된 WAF Docker 로그 행 수를 조회합니다. 일반 시스템 로그 전체를 덤프하지 않습니다.','WAF 출력 0건은 수집 정상이나 공격 부재를 증명하지 않습니다. 별도 파일·보관 경로는 이번 제한 조회에 포함되지 않습니다.')]
results=json.loads((root/'capture-results.json').read_text())
if recovery:
 entries += [
 ('18-real-metadata','실제 생성 요청의 모델·근거 메타데이터','실제 환자 웹에서 성공한 최신 요청의 helper_metadata입니다. configuredModel, KB 버전, 근거 ID·개수, generationUsed=true, fallbackUsed=false를 확인합니다.','modelVersion은 현재 null입니다. 요청별 가중치 다이제스트가 저장됐다고 설명하지 않습니다. 모델 호스트에서 관측한 다이제스트는 별도 JSON 증거입니다.'),
 ('19-request-pair','실제 요청과 시작·종료 로그 연결','동일한 요청 별칭으로 시작 이벤트와 실제 생성 완료 이벤트를 연결했습니다. 생성된 업무 로그를 조회한 것이며 DB에 시험 로그를 직접 삽입하지 않았습니다.','metadata_present·hash_present는 값의 존재 여부입니다. 이것만으로 감사 해시 체인 전체 검증을 통과했다고 해석하지 않습니다.')]
 entries += [
 ('21-local-runtime','자동 복구 감시와 로드된 모델','실제 Windows 모델 호스트의 감시 작업 상태·프로세스·연결·로드된 모델 다이제스트입니다. 이 화면은 Azure VM이 아니라 로컬 모델 호스트입니다.','READY는 현재 확인 결과입니다. Windows 로그인 뒤 자동 실행하는 구성으로, 로그인 전 서비스 또는 실제 OS 재부팅 시험을 뜻하지 않습니다.'),
 ('22-startup-task','Windows 로그인 후 자동 시작','실제 작업 스케줄러 설정에서 UserLogon 트리거·Interactive·Limited·중복 실행 제한·재시작 설정을 읽었습니다. 계정명·SID는 제외했습니다.','Priority 4는 일반 실행 우선순위이며 관리자 권한이 아닙니다. 비밀번호를 저장하지 않으며 실제 재부팅 검증과 등록 설정은 구분합니다.'),
 ('23-recovery-test','중단된 프로세스의 실제 자동 복구','건강도우미의 정확한 Ollama·중계·SSH 프로세스를 종료한 뒤 감시 작업이 새 PID로 복구한 시험의 저장 결과입니다. 단순한 설정 화면이 아닙니다.','pcRebootPerformed=false: 프로세스 장애 복구 시험입니다. PC 전체 재부팅을 수행했다고 표시하지 않습니다. 최초 실패 기록도 별도 보존했습니다.'),
 ('24-runtime-events','자동 복구 작업의 실행 기록','로컬 감시 작업이 남긴 최근 12개의 구조화 이벤트입니다. 모델 준비·프로세스 시작·재시도 등 운영 동작을 확인합니다.','질문·답변·프롬프트·개인키·토큰·환경변수 원문은 저장하지 않습니다. 작업 로그는 DB의 환자 요청 감사로그와 별도입니다.')]
 overrides={
 '03-wireguard':('복구 후 두 피어의 핸드셰이크가 최근 시각으로 갱신되고 인터페이스가 UP인 것을 확인합니다. 피어 키·주소는 제외했습니다.','B병원 VM을 재개했습니다. 핸드셰이크 성공은 터널 통신의 증거이며 병원 포털·CT 전체 흐름 성공과는 구분합니다.'),
 '10-helper-metadata':('컬럼만 존재했던 상태에서 실제 요청의 시작·종료 로그에 메타데이터가 저장되는 상태로 바뀌었습니다. 기존 미기록 로그는 수정하지 않았습니다.','시작 로그에는 아직 근거·KB 정보가 없을 수 있습니다. 실제 생성 완료 로그의 상세 값은 18번 증적에서 확인합니다.'),
 '11-helper-connection':('복구 후 실제 연결 점검에서 transport=REACHABLE, relay=READY, model=AVAILABLE이 확인됩니다. 기존 비공개 SSH 소켓 경로를 유지했습니다.','상태 점검은 모델 목록 접근을 확인합니다. 실제 생성 성공은 별도의 환자 요청과 18·19번 감사기록으로 검증했습니다.')}
 entries=[(s,t,*overrides.get(s,(n1,n2))) for s,t,n1,n2 in entries if s in {v['panel'] for v in results}]
 version_verified=any('18-real-metadata'==v['panel'] and __import__('re').search(r'"modelVersion":\s*"[a-f0-9]{64}"',(root/'transcripts/18-real-metadata.txt').read_text(encoding='utf-16')) for v in results)
 if version_verified:
  entries=[(s,'요청별 모델 버전과 근거' if s=='18-real-metadata' else t,
   '실제 생성 완료 요청에 modelVersion 다이제스트와 모델명·KB 버전·근거 ID·개수가 함께 기록됐습니다. 추론 전·후 태그와 로드된 모델의 일치 확인을 거쳤습니다.' if s=='18-real-metadata' else n1,
   'Ollama 모델 아티팩트의 매니페스트 다이제스트입니다. 개별 가중치 파일의 직접 해시나 원격 보안 증명을 뜻하지 않습니다. 과거 미기록 로그는 변경하지 않았습니다.' if s=='18-real-metadata' else n2) for s,t,n1,n2 in entries]
assert len(results)==len(entries)
plan=[]
for slug,title,note1,note2 in entries:
 image=root/'original'/f'{slug}.png'
 width,height=struct.unpack('>II',image.read_bytes()[16:24])
 transcript=(root/'transcripts'/f'{slug}.txt').read_text(encoding='utf-16')
 # Entire original image stays unmodified; annotation rectangles are separate DOM elements.
 lines=transcript.splitlines()
 start=next((i for i,x in enumerate(lines) if x.startswith('RESULT:')),4)
 y=min(650,64+16*(start+1));bottom=min(height-35,64+16*(len(lines)+1))
 if bottom<=y:bottom=y+70
 esc=html.escape
 doc=f'''<!doctype html><html lang="ko"><meta charset="utf-8"><title>{esc(title)}</title>
 <style>*{{box-sizing:border-box}}body{{margin:0;width:1800px;background:#f1f4f8;color:#142d49;font-family:Pretendard,'Malgun Gothic',sans-serif}}header{{padding:25px 40px;border-bottom:4px solid #285bc7;height:130px}}small{{font-size:15px;color:#52677d}}h1{{margin:8px 0;font-size:31px}}main{{position:relative;padding:28px 40px;display:flex;gap:42px}}.terminal{{position:relative;flex:none;width:{width}px;height:{height}px}}img{{display:block;width:{width}px;height:{height}px}}.mark{{position:absolute;left:5px;top:{y}px;width:{width-31}px;height:{bottom-y}px;border:4px solid #e52d32;pointer-events:none}}aside{{width:450px;padding-top:40px}}.note{{border:4px solid #f0cd00;background:white;color:#111;padding:22px;font-size:21px;line-height:1.65;margin-bottom:30px}}.note b{{display:block;font-size:23px;margin-bottom:10px}}.arrow{{position:absolute;left:{40+width-24}px;top:{28+y+30}px;width:50px;height:4px;background:#e52d32}}.arrow:before{{content:'';position:absolute;left:-2px;top:-7px;border-right:15px solid #e52d32;border-top:9px solid transparent;border-bottom:9px solid transparent}}footer{{padding:5px 40px 24px;font-size:15px;color:#52677d;line-height:1.7}}</style>
 <header><small>MEDI Q / SERVER EVIDENCE / {slug.upper()}</small><h1>{esc(title)}</h1><small>실제 Azure Control VM SSH 터미널 캡처 · 원본 이미지 유지 / 설명 레이어 별도</small></header>
 <main><div class="terminal"><img src="../original/{slug}.png"><div class="mark"></div></div><span class="arrow"></span><aside><div class="note"><b>01 무엇을 확인하나요</b>{esc(note1)}</div><div class="note"><b>02 해석할 때 주의할 점</b>{esc(note2)}</div></aside></main>
 <footer>조회 시각은 터미널의 UTC 표기 기준 · SQL은 READ ONLY 트랜잭션 · 식별정보/키/토큰/질문 원문을 조회 단계부터 제외<br>원본: original/{slug}.png | 실제 출력: transcripts/{slug}.txt | 제어 화면/보고서 재현 이미지가 아닌 실제 콘솔 창 촬영</footer></html>'''
 (root/'editable'/f'{slug}.html').write_text(doc,encoding='utf8')
 if slug.startswith(('21-','22-','23-','24-')):
  doc=doc.replace('실제 Azure Control VM SSH 터미널 캡처','실제 Windows 모델 호스트 터미널 캡처').replace('SQL은 READ ONLY 트랜잭션','설정·상태·실제 실행 기록을 최소 필드로 조회')
  (root/'editable'/f'{slug}.html').write_text(doc,encoding='utf8')
 plan.append({'slug':slug,'title':title,'note1':note1,'note2':note2,'width':width,'height':height})
(root/'annotation-plan.json').write_text(json.dumps(plan,ensure_ascii=False,indent=2),encoding='utf8')
index='''<!doctype html><html lang="ko"><meta charset="utf-8"><title>MediQ 리눅스 터미널 증적</title><style>body{font-family:Pretendard,'Malgun Gothic',sans-serif;background:#f0f4f8;color:#18324f;max-width:1400px;margin:40px auto;padding:20px}h1{font-size:34px}p{line-height:1.8}article{background:white;padding:24px;margin:28px 0;border:1px solid #d0dcea}img{max-width:100%;margin-top:20px}a{color:#285bc7}code{font-size:15px}</style><h1>Medi Q · 실제 리눅스 터미널 관제 증적</h1><p>2026-10-20 / Azure Control VM에 고정 호스트키 SSH로 연결해 실행한 명령과 결과입니다. 실제 콘솔 창 원본 17장과 설명을 겹친 주석본 17장을 분리했습니다. 조회 결과를 그럴듯한 터미널로 재작성한 이미지가 아닙니다.</p><p>개인정보·비밀정보는 출력 전 제외했습니다. 원본은 무제한 로그 덤프가 아니라 최소 필드만 선택한 실제 출력입니다. DB SQL은 읽기 전용이며, 비TLS 차단 시험과 연결 상태 점검 외에 업무 요청·동의·티켓을 새로 생성하지 않았습니다. A·B VM 내부의 PACS 로그나 임상 영상 동작은 이 증적으로 검증하지 않습니다.</p><p>관련 요구사항: FR-037~FR-041 (감사·관제), FR-001~005 및 FR-014~025의 기존 처리 이력 확인. 서비스 정책·권한·영상 경로는 변경하지 않았습니다.</p>'''
for p in plan:
 s=p['slug'];index+=f'<article><h2>{esc(p["title"])}</h2><p>{esc(p["note1"])}<br>{esc(p["note2"])}</p><a href="original/{s}.png">원본 PNG</a> · <a href="annotated/{s}.png">주석 PNG</a> · <a href="editable/{s}.html">편집용 설명</a> · <a href="transcripts/{s}.txt">실제 출력 TXT</a><br><img loading="lazy" src="annotated/{s}.png"></article>'
if recovery:
 index=index.replace('원본 17장과 설명을 겹친 주석본 17장',f'원본 {len(entries)}장과 설명을 겹친 주석본 {len(entries)}장')
 index=index.replace('업무 요청·동의·티켓을 새로 생성하지 않았습니다.','복구 검증을 위해 실제 환자 웹에서 일반 AFP 질문을 보냈습니다. 동의·QR 티켓은 새로 생성하지 않았습니다.')
 index=index.replace('<h1>Medi Q · 실제 리눅스 터미널 관제 증적</h1>','<h1>Medi Q · 건강도우미·WireGuard 복구 후 증적</h1><p>복구 전 증적은 별도 원본 폴더에 그대로 보존했습니다. 실제 요청 검증 중 발생한 MODEL_TIMEOUT 이력도 삭제하지 않았습니다.</p>')
(root/'index.html').write_text(index,encoding='utf8')
print(json.dumps({'annotationDocuments':len(plan),'nativeOriginals':len(list((root/'original').glob('*.png')))}))
