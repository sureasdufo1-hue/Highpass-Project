"""Combine byte-preserved evidence sets; annotate a real browser capture separately.

No screen is reconstructed. Old manifests are verified before copying.
Run prepare, render-terminal-annotations.mjs on latest, then package.
"""
import pathlib, json, hashlib, shutil, html, zipfile, sys
import psutil

psutil.Process().nice(psutil.NORMAL_PRIORITY_CLASS)
psutil.Process().ionice(psutil.IOPRIO_NORMAL)

REPO = pathlib.Path(__file__).resolve().parents[1]
ROOT = pathlib.Path.home() / 'Downloads' / 'MediQ_통합관제증적_20261020'
LATEST = ROOT / 'latest'

def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

def prepare():
    slug = '25-patient-web'
    shutil.copyfile(LATEST/'ui/patient-helper-final.png', LATEST/f'original/{slug}.png')
    # Coordinates refer to the unchanged 1168x2231 browser screenshot.
    title = '자동 복구 후 실제 환자 웹 답변과 출처'
    note = '실제 Azure 환자 웹에서 AFP 검사 목적을 질문한 뒤 답변과 MedlinePlus 출처가 표시됐습니다. 합성 시연·학교 발표용 비임상 안내입니다.'
    limit = '이 UI에는 모델 다이제스트가 표시되지 않습니다. 같은 요청의 모델·근거 저장 결과는 18·19번 서버 증적으로 확인합니다. 화면의 홍길동은 합성 시연 인물입니다.'
    doc = f'''<!doctype html><html lang="ko"><meta charset="utf-8"><title>{title}</title>
<style>*{{box-sizing:border-box}}body{{margin:0;width:1800px;font-family:Pretendard,'Malgun Gothic',sans-serif;background:#f1f4f8;color:#142d49}}header{{padding:28px 40px;border-bottom:4px solid #285bc7}}h1{{font-size:32px}}main{{position:relative;display:flex;gap:44px;padding:28px 40px}}.screen{{position:relative;width:1168px;flex:none}}img{{display:block;width:1168px}}.mark{{position:absolute;left:96px;top:868px;width:585px;height:395px;border:4px solid #e52d32}}aside{{width:450px;padding-top:868px}}.note{{background:white;border:4px solid #f0cd00;color:#111;padding:24px;font-size:22px;line-height:1.7;margin-bottom:28px}}.arrow{{position:absolute;left:683px;top:947px;width:560px;border-top:4px solid #e52d32;pointer-events:none}}.arrow:before{{content:'';position:absolute;left:-2px;top:-11px;border-right:16px solid #e52d32;border-top:9px solid transparent;border-bottom:9px solid transparent}}footer{{padding:20px 40px;line-height:1.8}}</style>
<header><small>MEDI Q / ACTUAL PATIENT WEB / 25</small><h1>{title}</h1><p>실제 브라우저 원본 보존 · 설명은 별도 레이어</p></header>
<main><div class="screen"><img src="../original/{slug}.png"><div class="mark"></div></div><span class="arrow"></span><aside><div class="note"><b>01 답변과 근거를 함께 확인</b><p>{note}</p></div><div class="note"><b>02 서버 기록과 교차 확인</b><p>{limit}</p></div></aside></main><footer>실제 요청 별칭 4d699ec9ed · 완료 2026-10-20 20:03:31 KST · 모델 버전은 별도 DB 감사기록에서 확인<br>원본 PNG를 재작성하지 않았습니다. 표시 인물·검사 맥락은 합성 시연입니다.</footer></html>'''
    (LATEST/f'editable/{slug}.html').write_text(doc, encoding='utf8')
    plan=json.loads((LATEST/'annotation-plan.json').read_text(encoding='utf8'))
    plan=[p for p in plan if p['slug']!=slug]
    plan.append(dict(slug=slug,title=title,note1=note,note2=limit,width=1168,height=2231))
    (LATEST/'annotation-plan.json').write_text(json.dumps(plan,ensure_ascii=False,indent=2),encoding='utf8')
    # Preserve the scheduler's nonzero historical result rather than call it a successful exit.
    task_doc=LATEST/'editable/22-startup-task.html'
    text=task_doc.read_text(encoding='utf8')
    text=text.replace('Priority 4는 일반 실행 우선순위이며 관리자 권한이 아닙니다.',
        'Priority 4는 일반 우선순위이며 관리자 권한이 아닙니다. lastResult=2147946720은 중복 시작 요청 거부 기록으로, 성공 종료 코드가 아닙니다. 현재 Running 및 실제 감시 동작은 별도 확인했습니다.')
    task_doc.write_text(text,encoding='utf8')
    print('PREPARED: actual UI and separate annotation document')

REPORT = '''# Medi Q 통합 관제 증적 — 2026-10-20

## 최신 결과부터 확인
latest/18: 요청별 모델·근거 / 19: 요청 시작·완료 / 21: 연결·로드 상태 /
22: Windows 로그인 후 자동 시작 / 23: 실제 프로세스 장애 복구 / 25: 실제 환자 웹.

|검증|결과|근거|
|---|---|---|
|요청별 모델 버전 저장|PASS|18번 실제 DB 출력, 복구 후 요청 별칭 4d699ec9ed|
|실제 답변·출처 및 생성/대체 안내 구분|PASS|25번 실제 브라우저, 18·19번 감사기록|
|3개 프로세스 자동 복구|PASS|동일 감시 PID 아래 Ollama·중계·SSH가 모두 새 PID, 약 105초|
|Windows 작업 등록·수동 실행·감시 동작|PASS|UserLogon / Interactive / Limited / 비밀번호 저장 없음|
|PC 전체 재부팅 후 로그인 트리거 실행|NOT VERIFIED|PC를 재부팅하거나 사용자 세션을 종료하지 않음|
|Azure Control 배포·파일 일치·보호 컨테이너 유지|PASS|observations/verify.json|
|선택한 회귀·버전·감사 메타데이터 테스트|PASS|실행 36개 / 실패 0개|
|DB·DR 유지, 비TLS 차단|PASS|DB 시작 시각 유지·streaming async, 13·14번 캡처|
|CT·QR·의료진 뷰어 전체 종단 재검증|NOT VERIFIED|이번 건강도우미 개선 범위 밖|

## 요청별 모델 버전의 의미
qwen3.5:4b의 modelVersion:
`2a654d98e6fba55d452b7043684e9b57a947e393bbffa62485a7aac05ee4eefd`

Ollama 모델 아티팩트의 매니페스트 다이제스트다. 개별 가중치 파일을 직접
해싱한 값이나 원격 실행 보안 증명은 아니다. 중계가 추론 전·후 태그 다이제스트,
로드된 모델 다이제스트, 실제 응답 모델명을 대조한 뒤 완료 요청에 저장한다.
불일치·누락은 생성 성공으로 처리하지 않는다. 과거 null 기록은 수정하지 않았다.
모델 준비 전인 시작 이벤트에는 modelVersion이 null일 수 있다.

복구 후 요청: 2026-10-20 20:03:13.121 → 20:03:31.539 KST.
18,418ms는 감사 이벤트 사이 간격이며 순수 추론 시간이 아니다.
generationUsed=true / fallbackUsed=false / failureCode=null / sourceCount=1.
sourceIds: school-demo-medical-test-afp-tumor-marker-AFP-DEF-01.
KB: medlineplus-upload-ko-20261012-v3,
medlineplus-medical-tests-school-demo-ko-20261013-v1.

## 자동 복구 범위
Windows 사용자 로그인 후 일반 권한의 작업 스케줄러 감시가 시작된다.
로그인 전 무인 서비스가 아니며 PC 종료·절전·미로그인 중에는 모델을 사용할 수 없다.
고정 loopback Ollama/중계와 호스트키 고정 SSH 경로를 유지한다.
주기 점검·모델 사전 준비·정확한 실행 경로별 프로세스 복구를 수행한다.
시험: 20:01:08.603 → 20:02:53.480 KST, 같은 감시 PID 28820 유지.
Ollama 5788→14812 / relay 10672→22940 / SSH 62664→62696.
초기 실패 2회도 observations에 보존했다. 낮은 CPU/I/O 우선순위와
진단 실행 중첩·오래된 상태 판정을 보완한 뒤 신선한 READY 사전조건으로 재시험했다.
작업 스케줄러 lastResult=2147946720은 중복 실행 요청 거부 이력이며 정상 종료 코드가 아니다.
현재 실행 상태와 프로세스 복구 성공은 별도 실제 관측으로 확인했다.

## 자료 종류와 시점
- latest: 최신 실제 터미널 11장 + 실제 브라우저 1장. 원본/주석 분리.
- archive-linux-before: 장애 상태를 포함한 이전 실제 터미널 17쌍.
- archive-helper-recovery: 이전 복구 당시 실제 터미널 10쌍. 당시 modelVersion=null 설명은 당시 사실이며 최신 상태는 latest가 기준.
- archive-query-reports: 조회 결과를 보고서로 렌더링한 16쌍. Azure Portal 또는 대시보드 원본 화면이 아님.

원본은 최소 필드만 조회한 실제 화면이다. 무제한 원시 로그 덤프가 아니다.
주석본은 원본 위에 빨간 테두리·화살표와 흰 배경·노란 테두리 설명을 별도로 표시했다.
합성 인물 외 계정·개인키·비밀번호·토큰·환자 질문/답변 원문은 관제 조회에서 제외했다.
비밀번호 해시·암호문·토큰/감사 해시는 구분한다. 감사 해시는 데이터 암호화가 아니다.
Key Vault/디스크 등 기존 설정 캡처는 촬영 시점의 점검 스냅샷이며 오늘 새로 Portal에서 촬영한 것으로 표시하지 않는다.

## 보안·운영 제한
임상 서비스가 아닌 합성 데이터 기반 MVP/PoC다. 자동 복구는 의료 콘텐츠 검수 승인이 아니다.
서비스 인증·동의·권한·의료영상 원본 분산 보관은 유지했다. DB 재기동·스키마 변경·
새 공개 포트·새 Azure 자원·관리자 권한 상승은 없다. Git 커밋/푸시는 이 작업 범위에 포함하지 않았다.
B overlay 포트 추가 탐색은 연결 미확인이므로 병원 포털 전체 정상으로 확대 해석하지 않는다.
장시간 안정성·실제 OS 재부팅·로그인 전 서비스화는 별도 검증 대상이다.

파일별 SHA-256은 manifest.json. ZIP CRC 및 모든 파일 해시를 검증했다.
원본 보관 폴더 3개는 덮어쓰지 않고 사본만 통합했다.
'''

def package():
    archives=[('MediQ_리눅스터미널_증적_20261020','archive-linux-before'),
              ('MediQ_건강도우미_복구증적_20261020','archive-helper-recovery'),
              ('MediQ_관제증적_20261020','archive-query-reports')]
    for source,name in archives:
        src=ROOT.parent/source; dst=ROOT/name
        manifest=json.loads((src/'manifest.json').read_text(encoding='utf8'))
        items=manifest['files'] if isinstance(manifest,dict) else manifest
        for item in items:
            rel=pathlib.Path(item['file'])
            assert not rel.is_absolute() and '..' not in rel.parts
            p=src/rel
            assert digest(p)==item['sha256'], 'SOURCE_CHANGED:'+str(p)
            target=dst/rel;target.parent.mkdir(parents=True,exist_ok=True)
            shutil.copyfile(p,target)
            assert digest(target)==digest(p)
        shutil.copyfile(src/'manifest.json',dst/'manifest.json')
    obs=ROOT/'observations';obs.mkdir(exist_ok=True)
    for name in ['auto-recovery-test.json','auto-recovery-test-first-fail.json','auto-recovery-test-second-fail.json','verify.json']:
        shutil.copyfile(REPO/'artifacts/azure/helper-version-20261020'/name,obs/name)
    shutil.copyfile(REPO/'artifacts/azure/helper-recovery-20261020/latest-verification.json',obs/'actual-request-verification.json')
    (ROOT/'README.md').write_text(REPORT,encoding='utf8')
    docs=ROOT/'implementation';docs.mkdir(exist_ok=True)
    for name in ['helper-model-version.js']:
        shutil.copyfile(REPO/'src'/name,docs/name)
    for name in ['helper-runtime-supervisor.py','install-helper-autostart.ps1','test-helper-auto-recovery.py']:
        shutil.copyfile(REPO/'scripts'/name,docs/name)
    shutil.copyfile(REPO/'docs/operations/helper-version-autorecovery-2026-10-20.md',docs/'implementation-review.md')
    plan=json.loads((LATEST/'annotation-plan.json').read_text(encoding='utf8'))
    # Rebuild latest gallery to include UI, explicitly distinguish local vs Azure captures.
    cards=''.join(f'<article><h2>{html.escape(p["title"])}</h2><p>{html.escape(p["note1"])}</p><a href="original/{p["slug"]}.png">원본</a> · <a href="annotated/{p["slug"]}.png">주석본</a> · <a href="editable/{p["slug"]}.html">편집용</a><img loading="lazy" src="annotated/{p["slug"]}.png"></article>' for p in plan)
    style='body{font-family:Pretendard,"Malgun Gothic",sans-serif;background:#f0f4f8;color:#18324f;max-width:1450px;margin:40px auto;padding:24px;line-height:1.8}article,section{background:white;padding:26px;margin:28px 0;border:1px solid #cedbea;border-radius:12px}img{width:100%;height:auto}a{color:#285bc7}h1{font-size:36px}strong{color:#2057bb}'
    (LATEST/'index.html').write_text(f'<!doctype html><html lang="ko"><meta charset="utf-8"><title>최신 실제 증적</title><style>{style}</style><h1>건강도우미 모델 버전 · 자동 복구</h1><p>Azure SSH 터미널 7장, Windows 모델 호스트 터미널 4장, 실제 환자 웹 1장. 전체 PC 재부팅은 미검증입니다.</p><a href="../index.html">통합 목록으로</a>{cards}</html>',encoding='utf8')
    counts={}
    for folder in ['latest']+[n for _,n in archives]:
        counts[folder]={kind:len(list((ROOT/folder/kind).glob('*.png'))) for kind in ['original','annotated']}
    totals={k:sum(v[k] for v in counts.values()) for k in ['original','annotated']}
    (ROOT/'counts.json').write_text(json.dumps({'sections':counts,'totals':totals},indent=2),encoding='utf8')
    links=[('latest','최신 결과 — 모델 버전과 자동 복구','실제 요청·서버 기록·Windows 복구·환자 웹'),
           ('archive-linux-before','이전 장애 상태 — 실제 터미널','QR 생애주기·거부 사유·DB 저장 위치·TLS·해시·보호 설정'),
           ('archive-helper-recovery','이전 복구 과정 — 실제 터미널','모델 버전 수집 보완 전의 상태. 최신 결과와 구분'),
           ('archive-query-reports','보충 자료 — 조회 보고서','설정·관제 조회를 설명한 보고서 이미지. Portal 원본 화면 아님')]
    sections=''.join(f'<section><h2><a href="{name}/index.html">{title}</a></h2><p>{note}</p><p>원본 {counts[name]["original"]}장 · 주석본 {counts[name]["annotated"]}장</p></section>' for name,title,note in links)
    (ROOT/'index.html').write_text(f'''<!doctype html><html lang="ko"><meta charset="utf-8"><title>Medi Q 통합 관제 증적</title><style>{style}</style><h1>Medi Q · 통합 관제 증적</h1><p>2026-10-20 / 합성 데이터 기반 MVP·PoC</p><section><h2>요청과 모델, 연결과 복구를 한 흐름으로</h2><p><strong>실제 요청별 모델 버전 저장 PASS · 세 프로세스 자동 복구 PASS · 선택 테스트 36/36 PASS</strong></p><p>Windows 로그인 후 자동 실행 구성입니다. PC 전체 재부팅 시험은 NOT VERIFIED입니다.</p><a href="README.md">검증·범위·주의사항</a> · <a href="manifest.json">파일 해시</a> · <a href="observations/auto-recovery-test.json">실제 복구 결과</a><p>전체 원본 {totals['original']}장 + 주석본 {totals['annotated']}장. 이전 실패와 당시 관측은 보존했습니다.</p></section>{sections}<section><h2>최신 실제 요청의 모델·근거</h2><a href="latest/annotated/18-real-metadata.png"><img src="latest/annotated/18-real-metadata.png"></a></section></html>''',encoding='utf8')
    # Operational control files and a preliminary browser crop are deliberately excluded.
    allowed=['README.md','index.html','counts.json']
    files=[ROOT/n for n in allowed]
    for directory in ['original','annotated','editable','transcripts']:
        files.extend(p for p in (LATEST/directory).rglob('*') if p.is_file() and p.suffix in ['.png','.html','.txt'])
    files.extend(LATEST/n for n in ['index.html','capture-results.json','annotation-plan.json','render-results.json'])
    for directory in ['observations','implementation']+[n for _,n in archives]:
        files.extend(p for p in (ROOT/directory).rglob('*') if p.is_file())
    files=sorted(set(files))
    manifest=[{'file':p.relative_to(ROOT).as_posix(),'bytes':p.stat().st_size,'sha256':digest(p)} for p in files]
    (ROOT/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding='utf8')
    archive=ROOT.with_suffix('.zip')
    with zipfile.ZipFile(archive,'w',zipfile.ZIP_DEFLATED) as z:
        for p in files+[ROOT/'manifest.json']:z.write(p,ROOT.name+'/'+p.relative_to(ROOT).as_posix())
    with zipfile.ZipFile(archive) as z:
        assert z.testzip() is None
        for item in manifest:assert hashlib.sha256(z.read(ROOT.name+'/'+item['file'])).hexdigest()==item['sha256']
    print(json.dumps({'files':len(files),'counts':counts,'totals':totals,'zip':str(archive),'zipHash':digest(archive)},ensure_ascii=False))

if __name__=='__main__':
    {'prepare':prepare,'package':package}[sys.argv[1]]()
