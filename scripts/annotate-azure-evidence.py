"""Compose editable SVG annotation layers without changing screenshot files."""
import base64, hashlib, html, json, zipfile
from datetime import datetime, timezone
from pathlib import Path
from PIL import Image

SRC=Path('C:/Users/user/Downloads/MediQ_Azure_증적_20261016')
OUT=Path('C:/Users/user/Downloads/MediQ_Azure_증적_주석본_20261016')
for sub in ('pages','images','editable'):(OUT/sub).mkdir(parents=True,exist_ok=True)
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def a(rect,title,lines):return {'rect':rect,'title':title,'lines':lines}
spec=[
('portal/01-resource-group.png','배포 자원을 한눈에 확인',[
 a([310,510,810,138],'01  실제 배포된 자원',['Key Vault 2개와 로그 작업 공간이','리소스 목록에 표시됩니다.']),
 a([718,187,160,46],'02  위치 표시는 구분해서 읽기',['Korea Central은 리소스 그룹 위치.','아래 개별 자원은 Japan East입니다.'])]),
('portal/02-primary-nsg-inbound.png','주 서버 · 허용할 통신만 명시',[
 a([308,359,812,62],'01  관리·VPN 원본 제한',['SSH 22 / WireGuard UDP 51820.','허용 원본 주소는 마스킹했습니다.']),
 a([308,455,812,61],'02  공개 HTTPS 진입점',['웹·B 영상 진입점의 TCP 443 규칙.','허용 대상 IP는 각각 제한됩니다.']),
 a([308,520,812,30],'03  나머지 인바운드 차단',['우선순위 200의 명시적 거부 규칙.','상세 동작은 기존 조회 JSON 참조.'])]),
('portal/03-traffic-manager-overview.png','Traffic Manager · 준비와 운영을 구분',[
 a([280,382,150,45],'01  현재 비활성 상태',['프로필이 Disabled입니다.','실제 사용자 접속 전환은 미수행.']),
 a([710,330,160,44],'02  우선순위 기반 구성',['라우팅 방법은 Priority입니다.','설정 존재 ≠ 장애 전환 검증 완료.'])]),
('portal/04-traffic-manager-configuration.png','Traffic Manager · 라우팅과 모니터 설정',[
 a([280,190,810,50],'01  Priority 라우팅',['우선순위 방식으로 설정했습니다.','검증 프로필은 현재 비활성입니다.']),
 a([280,309,810,49],'02  DNS TTL 30초',['DNS 응답의 캐시 유지 설정입니다.','장애 복구시간 30초 보장은 아닙니다.']),
 a([280,398,810,173],'03  HTTPS 상태 확인 설정',['HTTPS / 443 / 루트 경로(/).','응답 조건·프로브 간격은 아래 표시.'])]),
('portal/05-traffic-manager-endpoints.png','실제 접속 경로와 분리된 검증 환경',[
 a([335,307,780,37],'01  참조 엔드포인트 1개',['상태와 모니터 상태 모두 Disabled.','대기 서버 자동 전환은 미검증입니다.'])]),
('portal/06-standby-nsg-inbound.png','대기 서버 · 관리 경로만 허용',[
 a([310,358,810,32],'01  SSH 접근 원본 제한',['관리자·주 서버의 지정 주소만 허용.','대기 DB 공개 포트 규칙은 없습니다.']),
 a([310,393,810,31],'02  기타 인바운드 거부',['우선순위 200의 차단 규칙입니다.','앱·HTTPS 대기 서비스와 구분합니다.'])]),
('portal/07-key-vault-protection.png','Key Vault · 삭제 사고에 대비',[
 a([727,380,170,84],'01  삭제 보호 사용',['일시 삭제와 제거 보호가 켜져 있습니다.','키 복구 시험 완료를 뜻하지 않습니다.']),
 a([278,249,150,40],'02  리전 확인',['이 Key Vault의 위치는 Japan East.','복구 Vault도 같은 리전입니다.'])]),
('portal/08-key-vault-public-access-disabled.png','Key Vault · 인터넷 직접 접근 차단',[
 a([542,247,264,28],'01  공용 액세스 사용 안 함',['공개 네트워크 접근을 차단한 설정.','사설 경로와 인증·권한은 별도 필요.']),
 a([289,420,575,26],'02  신뢰 서비스 예외 미선택',['이 Vault에서 해당 우회 예외는','체크되어 있지 않습니다.'])]),
('portal/09-key-vault-private-endpoint.png','Key Vault · 승인된 사설 연결',[
 a([320,348,674,34],'01  Private Endpoint 승인',['연결 상태가 승인됨으로 표시됩니다.','사설 연결에도 별도 권한이 필요합니다.'])]),
('portal/10-key-vault-diagnostics-destination.png','Key Vault · 감사 로그의 수집 대상',[
 a([308,283,790,47],'01  진단 설정과 작업 공간',['진단 설정의 Log Analytics 대상 확인.','다음 화면에서 수집 범주를 확인합니다.'])]),
('portal/11-key-vault-audit-category.png','키 사용 이력을 로그로 남기는 설정',[
 a([48,460,160,30],'01  Audit Logs 수집',['감사 로그 범주가 체크되어 있습니다.','AllMetrics와는 별도의 선택입니다.']),
 a([543,373,490,158],'02  Log Analytics로 전송',['지정된 작업 공간이 선택되어 있습니다.','전체 로그 수신 성공과는 구분합니다.'])]),
('portal/12-standby-vm-overview.png','East Asia · DB 대기 서버',[
 a([297,282,160,84],'01  다른 리전에서 실행 중',['대기 VM의 위치는 East Asia입니다.','DB 복제 상태는 별도 보고서 참조.']),
 a([726,284,349,39],'02  시연용 VM 크기',['B2als v2 / 2 vCPU / 4 GiB.','전체 서비스 자동 DR은 아직 아닙니다.'])]),
('portal/13-log-analytics-workspace.png','Log Analytics · 로그 조회 기반',[
 a([278,345,165,84],'01  활성 작업 공간',['상태 활성 / 위치 Japan East.','로그별 수집 여부는 개별 확인 필요.']),
 a([726,433,330,40],'02  작업 공간 사용 권한 필요',['로그 조회도 권한 통제를 적용합니다.','이 화면만으로 역할 범위는 판단 불가.'])]),
('portal/14-primary-vm-overview.png','Japan East · 기존 서비스 유지',[
 a([296,333,165,82],'01  주 서버 실행 상태',['Japan East에서 실행 중입니다.','증적 수집 중 재시작하지 않았습니다.']),
 a([726,489,350,38],'02  기존 공개 DNS 유지',['기존 웹 주소가 연결된 주 서버입니다.','Traffic Manager로 전환하지 않았습니다.'])]),
('portal/15-primary-managed-identity.png','관리 ID · 비밀번호 대신 서비스 신원',[
 a([288,314,145,48],'01  시스템 할당 ID 켜짐',['VM에 연결된 관리 ID가 활성입니다.','이 설정만으로 모든 접근 권한은 없음.']),
 a([288,431,150,54],'02  역할 할당은 별도 관리',['접근 범위는 Azure 역할로 제한합니다.','실제 역할 목록은 이 화면에 미표시.'])]),
('reports/01-waf.jpg','WAF · 실행 설정을 근거로 설명',[
 a([102,277,240,27],'01  규칙 엔진 On',['Coraza WAF 규칙 엔진 활성 설정.','관리형 Azure WAF와는 다릅니다.']),
 a([102,414,500,51],'02  OWASP CRS 불러오기',['설정과 룰 파일 포함 지시문입니다.','공격 차단 실험 성공 증거는 아닙니다.'])]),
('reports/02-wireguard.jpg','WireGuard · 피어의 최근 통신 상태',[
 a([167,385,326,29],'01  피어 1 핸드셰이크',['조회 당시 마지막 핸드셰이크 12초 전.','키·연결 주소는 보고서에서 제외.']),
 a([167,548,326,29],'02  피어 2 핸드셰이크',['조회 당시 마지막 핸드셰이크 37초 전.','CT 전송 성공과는 다른 증적입니다.'])]),
('reports/03-dpop.jpg','DPoP · 설정 확인과 종단 시험을 구분',[
 a([101,249,350,106],'01  DPoP 필수 설정·저장소',['필수 플래그와 replay ledger 확인.','실제 재전송 차단 시험은 미검증.']),
 a([102,385,588,81],'02  무인증 요청 거부 관측',['API 401 / 영상 경로 403을 관측.','403은 경로 거부이며 토큰 검증 증거 아님.'])]),
('reports/04-dr.jpg','DR · 복제는 확인, 전환은 미수행',[
 a([102,249,320,81],'01  관측 시 LSN 일치',['주 DB·수신·재생 위치가 일치합니다.','비동기 복제의 관측 시점 결과입니다.']),
 a([102,354,390,53],'02  읽기 전용·쓰기 거부',['대기 DB는 복구 모드 / 읽기 전용.','쓰기 거부가 확인되었습니다.']),
 a([102,409,365,54],'03  승격·사용자 전환 없음',['promotion / traffic changed = false.','실제 장애 전환 시험은 별도 필요.'])]),
('reports/05-audit.jpg','감사 수집 · 확인 범위와 남은 과제',[
 a([102,221,542,80],'01  세 가지 감사 경로',['Key Vault / WAF / 앱 감사 경로를','조회 결과로 정리한 보고서입니다.']),
 a([102,304,647,79],'02  Entra 연결은 미확정',['조회 결과 0건 / 진단 설정 권한 부족.','완전한 수집 연결로 표현하지 않습니다.'])])]

captures=json.loads((SRC/'manifest.json').read_text(encoding='utf-8'))['portalCaptures']
times={r['file'].replace('\\','/'):r['capturedAt'] for r in captures}
records=[]
def build(number,rel,title,notes,crop=None):
    p=SRC/rel; w,h=Image.open(p).size
    if crop:cx,cy,cw,ch=crop
    else:cx,cy,cw,ch=0,0,w,h
    scale=min(1183/cw,884/ch) if crop else 1
    iw,ih=cw*scale,ch*scale
    sw=max(1750,int(iw)+590); sh=max(1000,int(ih)+160)
    ix,iy=20,100; bx=max(1240,int(iw)+70); bw=sw-bx-30
    data=base64.b64encode(p.read_bytes()).decode();mime='image/png' if p.suffix=='.png' else 'image/jpeg'
    s=[f'<svg xmlns="http://www.w3.org/2000/svg" width="{sw}" height="{sh}" viewBox="0 0 {sw} {sh}">',
       '<defs><marker id="tip" markerWidth="10" markerHeight="10" refX="8" refY="5" orient="auto"><path d="M0,0 L10,5 L0,10 Z" fill="#df2027"/></marker></defs>',
       '<rect width="100%" height="100%" fill="#f6f8fc"/>',
       f'<text x="24" y="39" font-family="Malgun Gothic" font-size="28" font-weight="700" fill="#152c46">{number}  {html.escape(title)}</text>',
       f'<text x="24" y="72" font-family="Malgun Gothic" font-size="17" fill="#56677c">'+('실제 Portal 캡처 · 마스킹본에 설명 추가' if rel.startswith('portal') else '조회 보고서의 화면 캡처 · Portal / 터미널 화면 아님')+'</text>',
       f'<svg x="{ix}" y="{iy}" width="{iw}" height="{ih}" viewBox="{cx} {cy} {cw} {ch}"><image width="{w}" height="{h}" href="data:{mime};base64,{data}"/></svg>']
    for j,n in enumerate(notes):
        x,y,rw,rh=n['rect'];x=ix+(x-cx)*scale;y=iy+(y-cy)*scale;rw*=scale;rh*=scale
        by=150+j*218; bh=165; endx=x+rw+7; endy=y+rh/2
        gutter=ix+iw+22+j*10
        s += [f'<rect x="{x}" y="{y}" width="{rw}" height="{rh}" fill="none" stroke="#df2027" stroke-width="4"/>',
              f'<path d="M{bx},{by+bh/2} L{gutter},{by+bh/2} L{gutter},{endy} L{endx},{endy}" fill="none" stroke="#df2027" stroke-width="3" marker-end="url(#tip)"/>',
              f'<rect x="{bx}" y="{by}" width="{bw}" height="{bh}" rx="4" fill="white" stroke="#f0d000" stroke-width="5"/>',
              f'<text x="{bx+22}" y="{by+39}" font-family="Malgun Gothic" font-size="23" font-weight="700" fill="#111">{html.escape(n["title"])}</text>']
        for k,line in enumerate(n['lines']):s.append(f'<text x="{bx+22}" y="{by+84+k*34}" font-family="Malgun Gothic" font-size="21" fill="#111">{html.escape(line)}</text>')
    stamp=times.get(rel,'2026-10-16 · 보고서의 관측 시각 참조')
    footer=f'설명용 주석본 · 원본 / 마스킹본 별도 보관 | {stamp} | DRAFT / UNASSIGNED'
    s.append(f'<text x="24" y="{sh-20}" font-family="Malgun Gothic" font-size="16" fill="#56677c">{html.escape(footer)}</text></svg>')
    name=f'{number}-{p.stem}'; svg='\n'.join(s)
    (OUT/'editable'/f'{name}.svg').write_text(svg,encoding='utf-8')
    (OUT/'pages'/f'{name}.html').write_text(f'<!doctype html><html lang="ko"><meta charset="utf-8"><title>{html.escape(title)}</title><style>html,body{{margin:0;padding:0;width:{sw}px;height:{sh}px}}svg{{display:block}}</style>{svg}</html>',encoding='utf-8')
    records.append({'name':name,'title':title,'source':rel,'sourceSha256':sha(p),'width':sw,'height':sh,'annotations':notes,'crop':crop,'image':f'images/{name}.jpg'})

for i,(rel,title,notes) in enumerate(spec,1):build(f'{i:02}',rel,title,notes)
for num,idx,crop in [('21',1,[280,320,860,245]),('22',10,[20,330,1030,210]),('23',15,[90,217,570,255]),('24',18,[90,220,530,252])]:
    rel,title,notes=spec[idx];build(num,rel,'확대 · '+title,notes,crop)
(OUT/'annotation-spec.json').write_text(json.dumps(records,ensure_ascii=False,indent=2),encoding='utf-8')
items=''.join(f'<article><h2>{r["name"]} · {html.escape(r["title"])}</h2><a href="pages/{r["name"]}.html">주석 화면</a> · <a href="{r["image"]}">발표용 JPG</a> · <a href="editable/{r["name"]}.svg">편집용 SVG</a><br><img loading="lazy" src="{r["image"]}" style="width:100%"></article>' for r in records)
(OUT/'index.html').write_text('<!doctype html><html lang="ko"><meta charset="utf-8"><title>Medi Q 증적 주석본</title><style>body{max-width:1500px;margin:40px auto;font-family:Malgun Gothic;background:#f5f7fb;color:#152c46}article{padding:20px;background:white;margin:24px 0;border:1px solid #ccd7e7}a{color:#245bb7}</style><h1>Medi Q · 증적 설명 주석본 24장</h1><p>전체 화면 20장 + 핵심 확대 4장. 빨간 강조선·화살표 / 흰 바탕·노란 테두리·검정 설명.</p><p>기존 스크린샷은 변경하지 않았습니다. 설정과 검증 결과를 구분하며, 보고서 캡처는 실제 Portal 화면과 구분합니다.</p>'+items,encoding='utf-8')
(OUT/'README.md').write_text('# Medi Q 증적 주석본\n\n- 전체 화면 20장, 핵심 확대 4장.\n- images/: 발표에 삽입할 JPG. editable/: 원본 이미지를 내장한 편집 가능한 SVG 주석 레이어. pages/: 브라우저 표시본.\n- 원본 및 기존 마스킹본은 변경하지 않음. 확대본은 해당 부분을 확대 표시한 자료이며 새 캡처가 아님.\n- 설정값을 재생성하지 않고 기존 이미지를 삽입. 강조선 및 설명만 별도 레이어로 추가.\n- 기존 증적 기준일 2026-10-16. 새로운 Azure 동작 시험이나 배포는 하지 않음.\n- 실제 DR 장애 전환, 유효 L2/DPoP 종단 동작 등 미검증 사항은 그대로 유지.\n- 스크린샷 범위 밖 상세 정책 해설은 이전 조회 결과와 함께 읽어야 함.\n- DRAFT / UNASSIGNED. 원본·마스킹본의 무결성 검증은 manifest.json 참조.\n',encoding='utf-8')
def package():
    original=json.loads((SRC/'manifest.json').read_text(encoding='utf-8'))
    checks=[{'file':r['file'],'unchanged':sha(SRC/r['file'])==r['sha256']} for r in original['files']]
    rawchecks=[]
    for r in original['portalCaptures']:
        raw=Path('C:/Users/user/Pictures/Screenshots/MediQ_Azure_20261016/raw')/(Path(r['file']).stem+'.jpg')
        rawchecks.append({'file':raw.name,'unchanged':sha(raw)==r['rawSha256']})
    files=[{'file':str(p.relative_to(OUT)), 'sha256':sha(p)} for p in OUT.rglob('*') if p.is_file() and p.name!='manifest.json']
    m={'generatedAt':datetime.now(timezone.utc).isoformat(),'kind':'ANNOTATED_EXPLANATORY_DERIVATIVES','originalPackageUnchanged':checks,'rawScreenshotsUnchanged':rawchecks,'files':files,'renderedCount':len(list((OUT/'images').glob('*.jpg')))}
    assert all(r['unchanged'] for r in checks+rawchecks),'Source evidence changed'
    (OUT/'manifest.json').write_text(json.dumps(m,ensure_ascii=False,indent=2),encoding='utf-8')
    with zipfile.ZipFile(OUT.with_suffix('.zip'),'w',zipfile.ZIP_DEFLATED) as z:
        for p in OUT.rglob('*'):
            if p.is_file():z.write(p,str(p.relative_to(OUT)))
    print(json.dumps({'sourceChecks':len(checks),'rawChecks':len(rawchecks),'rendered':m['renderedCount'],'output':str(OUT)},ensure_ascii=False))
package()
