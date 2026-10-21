"""Build local, redacted evidence artifacts. Never changes Azure or source evidence."""
import json, re, hashlib, html, shutil, zipfile
from pathlib import Path
from datetime import datetime, timezone
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'artifacts/azure/architecture-evidence-20261016T022029Z'
SHOTS = Path('C:/Users/user/Pictures/Screenshots/MediQ_Azure_20261016')
OUT = Path('C:/Users/user/Downloads/MediQ_Azure_증적_20261016')
for folder in ('portal', 'queries', 'reports'):
    (OUT / folder).mkdir(parents=True, exist_ok=True)
FONT = 'C:/Windows/Fonts/malgun.ttf'
BOLD = 'C:/Windows/Fonts/malgunbd.ttf'
def font(size, bold=False): return ImageFont.truetype(BOLD if bold else FONT, size)
def read(p): return json.loads(p.read_text(encoding='utf-8-sig'))
def savejson(p, obj): p.write_text(json.dumps(obj, ensure_ascii=False, indent=2), encoding='utf-8')
def sha(p): return hashlib.sha256(p.read_bytes()).hexdigest()
def redact(s):
    s = re.sub(r'[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}', '[ACCOUNT REDACTED]', s)
    s = re.sub(r'\b[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\b', '[ID REDACTED]', s)
    s = re.sub(r'(?<![\w.])(?:\d{1,3}\.){3}\d{1,3}(?:/\d+)?', '[ADDRESS REDACTED]', s)
    s = re.sub(r'/home/[^/"\s]+', '/home/[USER REDACTED]', s)
    return s

captions = [
 '리소스 그룹 · 실제 배포 자원', '주 서버 NSG · 인바운드 규칙',
 'Traffic Manager · 비활성 검증 프로필', 'Traffic Manager · Priority / TTL / 모니터',
 'Traffic Manager · 비활성 엔드포인트', '대기 서버 NSG · 제한된 SSH',
 'Key Vault · 삭제 보호', 'Key Vault · 공개 접근 차단',
 'Key Vault · 승인된 Private Endpoint', 'Key Vault · 진단 로그 수집 대상',
 'Key Vault · Audit Logs 활성화', '대기 VM · East Asia / 실행 중',
 'Log Analytics · 활성 작업 공간', '주 VM · Japan East / 실행 중',
 '주 VM · 시스템 할당 관리 ID 활성화']
index = read(SHOTS / 'capture-index.json')
image_records = []
for n, item in enumerate(index):
    im = Image.open(item['file']).convert('RGB')
    d = ImageDraw.Draw(im)
    rects = item.get('redactions', [])
    # Header account block always masked; opaque fills, not reversible blur.
    rects = rects + [{'x': im.width-235, 'y': 0, 'width':235, 'height':42}]
    if n == 0:
        rects += [{'x':285,'y':258,'width':320,'height':28}]
    if item['name'] == '03-traffic-manager-overview':
        rects += [{'x':282,'y':348,'width':290,'height':26}]
    for r in rects:
        x,y,w,h = (r[k] for k in ('x','y','width','height'))
        if w > 0 and h > 0 and x < im.width and y < im.height and x+w > 0 and y+h > 0:
            d.rectangle((max(0,x-3),max(0,y-2),min(im.width,x+w+3),min(im.height,y+h+2)), fill='#1b2b43')
    p = OUT/'portal'/f'{item["name"]}.png'
    im.save(p)
    image_records.append({'file':str(p.relative_to(OUT)), 'title':captions[n],
        'kind':'ACTUAL_AZURE_PORTAL_SCREENSHOT_REDACTED', 'capturedAt':item['capturedAt'],
        'rawSha256':sha(Path(item['file'])), 'redactedSha256':sha(p),
        'redaction':'Opaque account, ID and address rectangles; original screenshot retained locally.'})

# Copy only scrubbed query data. Old, superseded KV query shapes omitted.
for p in (SOURCE/'publication').glob('*.json'):
    if p.name in {'07-vault.json','08-vault.json'}: continue
    (OUT/'queries'/p.name).write_text(redact(p.read_text(encoding='utf-8-sig')),encoding='utf-8')
dr_path = ROOT/'artifacts/azure/dr-standby-20261016T002757Z/replication-verify-011033.json'
dr = read(dr_path)
savejson(OUT/'queries/17-dr-replication.json', json.loads(redact(json.dumps(dr))))
runtime=read(SOURCE/'11-primary-security-runtime.json')['data']
policy=read(SOURCE/'15-policy-audit-metadata.json')['data']
sources=read(SOURCE/'16-waf-entra-source-check.json')['data']

# Editable SVG and matching PNG diagram: explicitly separate observations from documented paths.
W,H=1800,1110
im=Image.new('RGB',(W,H),'#f4f7fc'); d=ImageDraw.Draw(im)
svg=[f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}"><rect width="100%" height="100%" fill="#f4f7fc"/>']
def txt(x,y,t,size=22,color='#163454',bold=False):
    d.text((x,y),t,font=font(size,bold),fill=color)
    svg.append(f'<text x="{x}" y="{y+size}" font-family="Malgun Gothic, sans-serif" font-size="{size}" font-weight="{700 if bold else 400}" fill="{color}">{html.escape(t)}</text>')
def rect(x,y,w,h,fill='#ffffff',stroke='#c5d3e6'):
    d.rounded_rectangle((x,y,x+w,y+h),16,fill=fill,outline=stroke,width=2)
    svg.append(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="16" fill="{fill}" stroke="{stroke}" stroke-width="2"/>')
def box(x,y,w,h,title,lines,fill='#ffffff'):
    rect(x,y,w,h,fill);txt(x+22,y+16,title,25,bold=True)
    for i,line in enumerate(lines):txt(x+22,y+58+i*30,line,20)
def arrow(x1,y1,x2,y2,color='#2b61b5',dashed=False):
    import math
    if dashed:
        length=math.hypot(x2-x1,y2-y1)
        for k in range(0,int(length),16):
            a=k/length;b=min(k+9,length)/length
            d.line((x1+(x2-x1)*a,y1+(y2-y1)*a,x1+(x2-x1)*b,y1+(y2-y1)*b),fill=color,width=3)
    else:d.line((x1,y1,x2,y2),fill=color,width=3)
    a=math.atan2(y2-y1,x2-x1)
    pts=[(x2,y2),(x2-12*math.cos(a-.45),y2-12*math.sin(a-.45)),(x2-12*math.cos(a+.45),y2-12*math.sin(a+.45))]
    d.polygon(pts,fill=color)
    dash=' stroke-dasharray="9 7"' if dashed else ''
    svg.append(f'<line x1="{x1}" y1="{y1}" x2="{x2}" y2="{y2}" stroke="{color}" stroke-width="3"{dash}/><polygon points="'+ ' '.join(f'{x},{y}' for x,y in pts)+f'" fill="{color}"/>')
txt(50,28,'Medi Q  |  현재 구성과 DR 준비 상태',42,bold=True)
txt(52,87,'2026.10.16 조회 기준 · 합성 데이터 MVP / PoC · 실제 장애 전환 수행하지 않음',23)
rect(340,155,880,590,'#e8f0fc');txt(365,170,'AZURE · JAPAN EAST / 기존 서비스',27,bold=True)
box(50,235,245,150,'환자 · 의료진',['웹 / 모바일 PWA','Microsoft 로그인'])
box(370,230,340,155,'HTTPS 웹 진입점',['Caddy + Coraza WAF','OWASP CRS · 컨테이너','관리형 Azure WAF 아님'])
box(790,230,390,155,'Control API',['동의 · RBAC / ABAC','단기 토큰 · 감사 · 최소 정보','원본 DICOM 지속 저장 안 함'])
arrow(295,300,370,300);arrow(710,300,790,300)
box(790,445,390,125,'PostgreSQL',['정책 · 동의 · 감사 데이터','외부 공개 포트 없음']);arrow(985,385,985,445)
box(370,445,340,125,'Key Vault / Private Link',['공개 접근 차단 · 삭제 보호','기본 + 복구 Vault: 같은 리전'])
arrow(820,385,820,410);arrow(820,410,540,410);arrow(540,410,540,445)
box(370,610,340,105,'Log Analytics',['Key Vault Audit Logs']);arrow(540,570,540,610)
box(790,595,390,130,'보안관제 수집',['앱 감사 + WAF 수집기','Entra 진단 설정: 권한 부족'])
box(1280,155,470,180,'EAST ASIA · DB 대기 서버',['PostgreSQL streaming / async','읽기 전용 · 쓰기 거부 확인','관측 시 송신 / 수신 / 재생 LSN 일치','앱 배포 · 승격 · 서비스 전환 미검증'])
arrow(1180,505,1250,505);arrow(1250,505,1250,280);arrow(1250,280,1280,280)
txt(1280,355,'복제: SSH 터널 + PostgreSQL TLS',20)
box(1280,410,470,200,'Traffic Manager · 별도 검증',['Priority · TTL 30초','프로필 Disabled','주 서버 참조 엔드포인트 Disabled','실제 사용자 DNS와 연결하지 않음'],'#fff5e4')
txt(1280,637,'복제 준비 ≠ 실제 장애 전환 완료',24,'#9b5a15',True)
rect(50,785,1700,255,'#eef6f5')
txt(75,800,'영상 DATA PLANE · 병원 경로',26,bold=True)
box(75,855,340,145,'별도 영상 HTTPS 주소',['Azure L4 TCP 중계','Control API 영상 경유 아님','이번 무인증 요청: 403'])
box(495,855,340,145,'WireGuard',['주 서버 피어 2개','핸드셰이크 상태 확인','키 · 엔드포인트 비공개'])
box(915,855,375,145,'B 병원 Gateway / PACS',['TLS 종료 · 권한 재검증','승인 영상 열람 / 수신','B LUKS: 기존 문서 근거'])
box(1370,855,355,145,'A 병원 Gateway / PACS',['원본 분산 보관','mTLS · DICOMweb','병원 내부 상태 재확인 제외'])
arrow(415,925,495,925);arrow(835,925,915,925,dashed=True);arrow(1370,925,1290,925,dashed=True)
txt(55,1062,'실선: 이번 자원·런타임 조회 근거   |   점선: 기존 설계·문서 경로, 이번 승인 영상 종단 시험은 NOT VERIFIED',21)
im.save(OUT/'MediQ_현재구성도.png');svg.append('</svg>');(OUT/'MediQ_현재구성도.svg').write_text('\n'.join(svg),encoding='utf-8')

reports=[
 ('01-waf','WAF 실행 설정', '11-primary-security-runtime.json',
  '\n'.join(runtime['wafConfig'][0]['selectedDirectives']),
  'PASS: 설정 조회 · 수집 타이머 active. 최근 로그 경고 2건 / 명시적 차단 메시지 0건. 공격 차단 시험은 NOT VERIFIED.'),
 ('02-wireguard','WireGuard 연결 상태','11-primary-security-runtime.json',
  json.dumps(runtime['wireGuard'],ensure_ascii=False,indent=2),
  'PASS: 피어 핸드셰이크 관측. 병원 PACS·700장 영상 종단 열람 성공을 뜻하지 않습니다.'),
 ('03-dpop','L2 / DPoP · 설정과 검증 한계','15-policy-audit-metadata.json',
  'AUTH_MODE = ENTRA_OIDC\nHIPASS_DPOP_REQUIRED = 1\nHIPASS_CAPSTONE_MOCK_IDP = 0\nreplay ledger exists = true\ncolumns = expires_at, proof_hash\n\n/api/security/proof-policy → 401 AUTHENTICATION_REQUIRED\n/api/security/events → 401 AUTHENTICATION_REQUIRED\n영상 경로 무인증 요청 → 403 PATIENT_ROUTE_NOT_ALLOWED',
  '설정·저장소 존재는 확인. 유효 L2/DPoP 발급, 재전송 거부, CT 승인 열람은 이번 세션 NOT VERIFIED. 403은 경로 거부입니다.'),
 ('04-dr','DR 복제 상태 · 전환은 미수행','17-dr-replication.json',
  f"Observed UTC: {dr['observedAt']}\nPrimary LSN: {dr['primary']['lsn']}\nReceive LSN: {dr['standby']['receiveLsn']}\nReplay LSN: {dr['standby']['replayLsn']}\nStreaming: async\nRecovery: true / Read only: on\nWrite denied: true\nPromotion executed: false\nPatient traffic changed: false",
  'PASS: 관측 시 DB 복제·읽기 전용. NOT VERIFIED: 장애 전환·앱 서비스 복구·RTO/RPO. 복제 슬롯 없음: 장기 단절 시 WAL 유실 위험.'),
 ('05-audit','감사 수집 · 조회 가능 범위','16-waf-entra-source-check.json',
  'Key Vault → AuditEvent → Log Analytics\nWAF → 컨테이너 로그 → 수집 타이머 active\n앱 감사 → PostgreSQL 집계 조회\nEntra SigninLogs 조회: HTTP 200 / 해당 앱 조회 결과 0건\nEntra 진단 설정 조회: AuthorizationFailed / Forbidden\n관측 라이선스: AAD_BASIC_EDU (P1/P2 확인 못 함)',
  'Entra 로그가 완전히 연결되었다고 판단할 수 없습니다. 앱 감사 집계는 과거 24시간 상위 12개이며 이번 E2E 시험 결과가 아닙니다.')]
css='body{font-family:Malgun Gothic,sans-serif;background:#f1f5fb;color:#163454;margin:0;padding:42px}main{max-width:1100px;margin:auto}h1{font-size:32px}article{background:white;padding:28px;border:1px solid #cad6e6;border-radius:16px;margin:24px 0}pre{white-space:pre-wrap;overflow-wrap:anywhere;font-size:17px;line-height:1.6;background:#f3f6fa;padding:20px}.note{background:#fff0d6;padding:20px;line-height:1.6}img{max-width:100%}a{color:#245bbb}.badge{font-weight:bold;color:#64748b}small{overflow-wrap:anywhere}'
for slug,title,source,body,note in reports:
    doc=f'<!doctype html><html lang="ko"><meta charset="utf-8"><title>{title}</title><style>{css}</style><main><p class="badge">Medi Q · READ-ONLY QUERY REPORT / Portal·터미널 캡처 아님</p><h1>{title}</h1><p>2026.10.16 조회 · 합성 시연 환경 · DRAFT / UNASSIGNED</p><pre>{html.escape(body)}</pre><p class="note">{html.escape(note)}</p><small>근거: <a href="../queries/{source}">{source}</a><br>SHA-256: {sha(OUT/"queries"/source)}</small></main></html>'
    (OUT/'reports'/f'{slug}.html').write_text(doc,encoding='utf-8')

summary='''# Medi Q Azure 증적 · 2026-10-16

## 범위와 판정
실제 Azure Portal 캡처 15장 + 마스킹한 조회 결과(JSON) + 읽기 전용 조회 보고서/보고서 화면 캡처 5장 + 현재 구성도.
검토 상태: DRAFT / UNASSIGNED. PASS는 명시된 확인 범위에 한하며 보안 인증이나 서비스 전체 완성을 의미하지 않는다.
이번 작업에서 Azure 설정 변경, 배포, DB 승격, 사용자 DNS 전환은 하지 않았다.

| 항목 | 결과 | 범위 |
|---|---|---|
| Portal 로그인·NSG·VM·Key Vault·TM 캡처 | PASS | 실제 설정 화면 저장 |
| Key Vault | PASS | 공개 접근 차단, Private Endpoint 승인, 삭제 보호, AuditEvent 진단 설정 |
| WAF | PASS | VM의 Coraza/CRS 실행 설정·수집기 확인. Azure 관리형 WAF 아님 |
| WireGuard | PASS | 주 서버 피어 2개 핸드셰이크 관측 |
| DPoP | PASS | 필수 플래그 및 replay ledger 존재만 확인 |
| DB 복제 | PASS | 관측 시 LSN 일치, streaming async, standby 읽기 전용·쓰기 거부 |
| 무인증 API 요청 | PASS | events와 proof-policy 401. 정책 내용 조회는 불가 |
| proof-policy 내용 조회 시도 | FAIL | 최초 검사 기대값 200과 실제 401 불일치. 인증 우회 없이 중단; 서비스 장애 판정 아님 |
| 영상 경로 무인증 요청 | PASS | 403 PATIENT_ROUTE_NOT_ALLOWED 관측. 토큰 유효성 검증 성공 증거 아님 |
| 유효 L2/DPoP·재전송 거부·승인 CT 열람 | NOT VERIFIED | 실제 환자·의료진 인증 종단 시험 미실행 |
| 실제 DR 장애 전환·RTO/RPO | NOT VERIFIED | TM Disabled, 대기 앱/HTTPS·승격 미완료, 기존 주소 유지 |
| Entra 진단 설정 | NOT VERIFIED | 권한 부족. SigninLogs 조회는 200이나 해당 앱 결과 0건 |
| 병원 A/B 내부 PACS·LUKS·700장 전송 | NOT VERIFIED | 이번 세션 병원 내부 재검증 미실행 |

## 해석 시 주의
- 복구 Key Vault도 Japan East에 있다. 타 리전 독립 키 복구가 완성된 구조가 아니다.
- 대기 VM은 East Asia의 DB 복제 서버다. 전체 애플리케이션 자동 DR이 아니다.
- 복제 슬롯이 없어 장기 단절 후 WAL 재확보/재동기화 절차가 필요할 수 있다.
- 백업 검증은 서버 개인키 파일을 제외한 명시적 범위이다. 전체 바이트 무예외 검증이라고 표현하지 않는다.
- 주 Control/DB 컨테이너는 readOnlyRootfs=false로 관측. 전체 컨테이너 하드닝 완료라고 표현하지 않는다.
- Portal VM의 Azure Disk Encryption 꺼짐과 Azure 관리 디스크의 플랫폼 저장 암호화는 별개다.
- WAF 경고 로그 존재만으로 공격 차단 시험을 통과했다고 볼 수 없다.
- 구성도 병원 경로 점선은 기존 문서 근거이며 이번 영상 종단 검증을 의미하지 않는다.

## 증적 출처
Azure CLI/ARM 조회, Portal 실제 화면, 주 VM 안전한 설정 허용목록 조회, DB 복제 검증 결과.
관련 기존 문서: docs/operations/azure-dr-standby-replication-2026-10-16.md,
docs/operations/azure-dr-traffic-manager-validation-2026-10-16.md,
docs/operations/security-sources-2026-10-14.md.
관련 FR: FR-014~025(정책·토큰), FR-026~031(Gateway), FR-037~041(감사). 기능 변경 없음.

## 마스킹과 무결성
Portal의 계정·구독/주체 ID·IP는 불투명 사각형으로 가렸다. 화면 전체를 재현한 합성 스크린샷이 아니다.
JSON에는 식별자·주소를 마스킹했다. 비밀키·토큰 값·원본 의료영상은 수집하지 않았다.
raw Portal 원본은 Pictures/Screenshots/MediQ_Azure_20261016/raw에 별도 보관하며 제출 ZIP에는 포함하지 않는다.
manifest.json의 원본 및 배포본 해시는 무결성 대조용이다. 독립 서명/타임스탬프 인증은 아니다.
reports/*.html은 조회 데이터를 읽기 쉽게 편집한 보고서이며 실제 Portal/터미널 화면으로 주장하지 않는다.
'''
(OUT/'README.md').write_text(summary,encoding='utf-8')
links=''.join(f'<li><a href="reports/{s}.html">{html.escape(t)}</a></li>' for s,t,*_ in reports)
gallery=''.join(f'<article><h2>{html.escape(r["title"])}</h2><p>{r["capturedAt"]} · 실제 Portal 캡처 / 마스킹</p><img src="{r["file"]}"></article>' for r in image_records)
(OUT/'index.html').write_text(f'<!doctype html><html lang="ko"><meta charset="utf-8"><title>Medi Q Azure 증적</title><style>{css}</style><main><h1>Medi Q · Azure 증적</h1><p>2026.10.16 · 읽기 전용 확인 · DRAFT / UNASSIGNED</p><p class="note">DB 복제 확인 ≠ 실제 DR 전환 완료. Traffic Manager는 비활성 검증 환경입니다.</p><img src="MediQ_현재구성도.png"><ul>{links}<li><a href="README.md">판정·한계·출처 전체</a></li><li><a href="manifest.json">증적 해시 목록</a></li></ul>{gallery}</main></html>',encoding='utf-8')

contact=Image.new('RGB',(1200,5*365),'#eff3fa');cd=ImageDraw.Draw(contact)
for i,r in enumerate(image_records):
    thumb=Image.open(OUT/r['file']);thumb.thumbnail((380,310))
    x=10+(i%3)*400;y=10+(i//3)*365
    cd.text((x,y),f'{i+1:02d} {captions[i][:21]}',font=font(15,True),fill='#153454')
    contact.paste(thumb,(x,y+30))
contact.save(OUT/'Portal_캡처목록.png')
manifest={'generatedAt':datetime.now(timezone.utc).isoformat(),'review':'DRAFT / UNASSIGNED','scope':'READ_ONLY_EVIDENCE_NO_FAILOVER','portalCaptures':image_records,'files':[]}
for p in sorted(OUT.rglob('*')):
    if p.is_file() and p.name!='manifest.json':manifest['files'].append({'file':str(p.relative_to(OUT)),'sha256':sha(p),'bytes':p.stat().st_size})
savejson(OUT/'manifest.json',manifest)
with zipfile.ZipFile(OUT.with_suffix('.zip'),'w',zipfile.ZIP_DEFLATED) as z:
    for p in sorted(OUT.rglob('*')):
        if p.is_file():z.write(p,str(p.relative_to(OUT)))
print(json.dumps({'folder':str(OUT),'portalScreenshots':len(image_records),'files':len(manifest['files'])},ensure_ascii=False))
