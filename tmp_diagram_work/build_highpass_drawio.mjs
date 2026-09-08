import fs from 'node:fs';
import path from 'node:path';

const outDir = 'C:/Users/user/Documents/New project/docs/architecture';
fs.mkdirSync(outDir, { recursive: true });
const base = 'highpass_hybrid_qr_dicomweb_architecture';

const C = {
  hospital: '#EAF2F8', control: '#E8F1FB', data: '#FFF0DF', patient: '#E8F5E9',
  external: '#F1ECF8', node: '#FFFFFF', gray: '#F3F4F6', red: '#B91C1C',
  blue: '#2563EB', navy: '#17365D', orange: '#D97706', purple: '#7C3AED', text: '#172033'
};

const esc = (s) => String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
const html = (s) => esc(s).replaceAll('\n','&lt;br&gt;');

function box(id, label, x, y, w, h, fill=C.node, stroke=C.navy, opts={}) {
  return { type:'box', id, label, x,y,w,h,fill,stroke, parent:opts.parent ?? '1', rounded:opts.rounded ?? true,
    fontSize:opts.fontSize ?? 15, bold:opts.bold ?? false, dashed:opts.dashed ?? false, align:opts.align ?? 'center' };
}
function edge(id, source, target, label, color=C.blue, opts={}) {
  return { type:'edge', id, source,target,label,color, width:opts.width ?? 2, dashed:opts.dashed ?? false,
    endArrow:opts.endArrow ?? 'block', parent:opts.parent ?? '1' };
}

const p1 = [];
p1.push(box('p1-title','하이패스 하이브리드 QR·DICOMweb 서비스 구성도',20,20,1870,55,'#FFFFFF','#FFFFFF',{fontSize:28,bold:true}));
p1.push(box('a-zone','A 병원 내부망 · Trust Zone A',20,105,330,770,C.hospital,C.navy,{fontSize:20,bold:true,align:'left'}));
p1.push(box('a-staff','A Hospital Staff\n전송요청 · 동의 확인',55,175,260,75,C.node,C.navy,{parent:'a-zone',bold:true}));
p1.push(box('a-pacs','A Hospital PACS / Orthanc\n원본 DICOM은 A 병원에 유지\nStudy · Series · Instance · Frame',55,320,260,105,C.node,C.navy,{parent:'a-zone',bold:true}));
p1.push(box('a-edge','A Hospital Edge Connector\n승인된 환자·Study·Series만 조회·송신\nmTLS · Deny by Default',55,600,260,105,C.node,C.navy,{parent:'a-zone',bold:true}));
p1.push(box('a-note','승인 범위 밖 Pixel Data 외부 전달 금지',55,745,260,55,C.gray,'#64748B',{parent:'a-zone',fontSize:13,dashed:true}));

p1.push(box('cp-zone','Cloud Control Plane\nIdentity · Consent · Policy · Ticket · Metadata · Audit',390,105,620,430,C.control,C.navy,{fontSize:20,bold:true,align:'left'}));
p1.push(box('api','API Gateway / Session\nTLS 1.3',425,180,170,65,C.node,C.blue,{parent:'cp-zone',bold:true}));
p1.push(box('identity','Identity & Institution\nprincipal · organization',615,180,170,75,C.node,C.blue,{parent:'cp-zone',bold:true,fontSize:13}));
p1.push(box('consent','Consent Service\npurpose · recipient · scope · validity · revoke',805,180,170,75,C.node,C.blue,{parent:'cp-zone',bold:true,fontSize:13}));
p1.push(box('ticket','Transfer Ticket / QR Service\nopaque ticket · jti · TTL · one-time',425,285,230,75,C.node,C.blue,{parent:'cp-zone',bold:true,fontSize:13}));
p1.push(box('policy','Policy Decision / Enforcement\nRBAC + ABAC · Study scope\nDeny by Default',680,285,295,82,C.node,C.blue,{parent:'cp-zone',bold:true,fontSize:13}));
p1.push(box('meta-db','Metadata & Transfer State DB\n참조자 · 동의 · 상태 · Ticket',425,405,245,72,'#E2E8F0','#475569',{parent:'cp-zone',bold:true,fontSize:13}));
p1.push(box('audit','Audit Service\nissue · scan · allow/deny · revoke · delete\ncorrelation ID · hash chain',695,405,280,72,'#E2E8F0','#475569',{parent:'cp-zone',bold:true,fontSize:13}));
p1.push(box('cp-note','기관·사용자·환자·Study·목적·기간 바인딩  |  DICOM Pixel Data 중앙 영구 저장 금지',425,490,550,30,'#DCEAF8','#7AA2CC',{parent:'cp-zone',fontSize:12}));

p1.push(box('dp-zone','Cloud Data Plane · 암호문 중계',390,565,620,265,C.data,C.orange,{fontSize:20,bold:true,align:'left'}));
p1.push(box('relay','Encrypted Data Relay\nCiphertext Relay · Edge-to-Edge 우선\nCloud Relay = 암호화 fallback',425,635,245,82,C.node,C.orange,{parent:'dp-zone',bold:true,fontSize:13}));
p1.push(box('integrity','Transfer Integrity\nAES-256-GCM · Manifest\nHash · AEAD Tag',695,635,280,82,C.node,C.orange,{parent:'dp-zone',bold:true,fontSize:13}));
p1.push(box('cache','Optional Encrypted Cache\nTTL · Auto Delete · 삭제증적\n영구 DICOM 저장소 아님',530,745,330,65,C.gray,'#6B7280',{parent:'dp-zone',bold:true,dashed:true,fontSize:13}));

p1.push(box('sec-zone','외부 보안서비스',1040,105,245,430,C.external,C.purple,{fontSize:19,bold:true,align:'left'}));
p1.push(box('idp','OIDC / OAuth IdP\nB 의료진 인증 · MFA',1070,180,185,70,C.node,C.purple,{parent:'sec-zone',bold:true}));
p1.push(box('kms','KMS / HSM\nDEK / KEK · key lifecycle',1070,285,185,70,C.node,C.purple,{parent:'sec-zone',bold:true}));
p1.push(box('pqc','선택적 PQC Extension\nML-KEM / ML-DSA 검토\nCrypto Agility · P1 확장',1070,400,185,85,C.gray,C.purple,{parent:'sec-zone',bold:true,dashed:true,fontSize:13}));

p1.push(box('b-zone','B 병원 사용자·내부망 · Trust Zone B',1320,105,570,770,C.hospital,C.navy,{fontSize:20,bold:true,align:'left'}));
p1.push(box('b-clinician','B Hospital Clinician\nOIDC/OAuth + MFA\nQR만으로 인증하지 않음',1360,175,220,90,C.node,C.navy,{parent:'b-zone',bold:true}));
p1.push(box('b-edge','B Hospital Edge Connector\n수신 · 복호화 · 무결성 · 정책강제\n브라우저와 A PACS 사이 통제 경계',1360,350,220,100,C.node,C.navy,{parent:'b-zone',bold:true,fontSize:13}));
p1.push(box('viewer','OHIF Reference Viewer\nQIDO-RS 검색 · WADO-RS 조회\n임상 진단용 아님',1635,350,220,100,C.node,C.navy,{parent:'b-zone',bold:true,fontSize:13}));
p1.push(box('b-pacs','B Hospital PACS / Orthanc\n별도 승인 영상의 선택적 편입\nSTOW-RS / Legacy C-STORE',1500,600,250,105,C.node,C.navy,{parent:'b-zone',bold:true,fontSize:13}));
p1.push(box('b-note','조회권한 ≠ PACS 편입권한\nViewer는 B Connector에만 접근',1450,755,310,62,C.gray,'#64748B',{parent:'b-zone',fontSize:13,dashed:true}));
p1.push(box('public','Public Internet',1100,610,150,45,'#FFFFFF','#9CA3AF',{fontSize:13,dashed:true}));

p1.push(box('patient','Patient Mobile\nConsent · QR / Deep Link · One-time Transfer Ticket · 선택적 확인\n영상 저장소가 아니라 QR·동의·승인 단말',410,855,600,95,C.patient,'#2E7D32',{fontSize:15,bold:true}));
p1.push(box('patient-note','QR ≠ Authentication  |  QR에 PII·DICOM·복호화 키 저장 금지',1040,865,245,72,C.gray,'#2E7D32',{fontSize:12,dashed:true}));

p1.push(edge('e-a1','a-pacs','a-edge','DICOMweb 내부연결',C.orange,{width:4}));
p1.push(edge('e-a2','a-staff','consent','전송요청 · 동의 확인',C.blue));
p1.push(edge('e-c1','api','identity','principal / institution',C.blue));
p1.push(edge('e-c2','identity','policy','verified principal',C.blue));
p1.push(edge('e-c3','consent','ticket','consent reference',C.blue));
p1.push(edge('e-c4','ticket','policy','ticket validate',C.blue));
p1.push(edge('e-c5','policy','meta-db','state',C.blue));
p1.push(edge('e-c6','policy','audit','allow / deny',C.blue));
p1.push(edge('e-p1','patient','ticket','Consent / Ticket Reference / Approval',C.blue));
p1.push(edge('e-idp','b-clinician','idp','OIDC/OAuth + MFA',C.purple));
p1.push(edge('e-idp2','idp','identity','issuer · audience · role',C.purple));
p1.push(edge('e-kms','kms','integrity','DEK / KEK',C.purple,{dashed:true}));
p1.push(edge('e-pqc','pqc','kms','P1 · Crypto Agility',C.purple,{dashed:true}));
p1.push(edge('e-d1','a-edge','relay','mTLS · AES-256-GCM Payload',C.orange,{width:5}));
p1.push(edge('e-d2','relay','b-edge','WADO-RS · On-demand Retrieval',C.orange,{width:5}));
p1.push(edge('e-d3','relay','cache','optional fallback', '#6B7280',{dashed:true}));
p1.push(edge('e-b1','b-clinician','b-edge','승인 요청',C.blue));
p1.push(edge('e-b2','b-edge','viewer','QIDO-RS 검색 / WADO-RS 조회',C.orange,{width:4}));
p1.push(edge('e-b3','b-edge','b-pacs','STOW-RS 저장 · C-STORE 선택',C.orange,{width:4}));
p1.push(edge('e-b4','policy','b-edge','단기 조회권한 · 별도 편입정책',C.blue));
p1.push(edge('deny1','viewer','a-pacs','✕ 금지: 브라우저의 타 병원 PACS 직접 접근',C.red,{dashed:true,width:3,endArrow:'none'}));
p1.push(edge('deny2','public','a-pacs','✕ Public Internet 직접 접근 금지',C.red,{dashed:true,width:3,endArrow:'none'}));
p1.push(box('legend','범례  ━ 파란선: 제어·동의·권한   ━ 주황 굵은선: DICOM Pixel Data   ┄ 회색/보라: 선택·확장   ✕ 빨강: 금지   🔒 TLS·mTLS·암호화   ▣ DB: 메타데이터·상태·감사',20,960,1870,35,'#F8FAFC','#CBD5E1',{fontSize:12,align:'left'}));
p1.push(box('notice','QR은 의료영상 저장매체가 아니라 환자 동의와 일회용 전송권한을 전달하는 수단이다.  |  원본 DICOM은 A 병원 PACS에 유지되며 중앙 클라우드는 Pixel Data를 영구 저장하지 않는다.\nB 병원은 인증 의료진의 정책 승인 후 원격조회 또는 선택적 편입을 수행한다.  |  캡스톤 PoC · 합성 데이터 · 실제 병원 운영/실제 PACS 연동/임상진단 아님',20,1003,1870,58,'#FFF7ED','#B45309',{fontSize:12,bold:true}));

const p2=[];
p2.push(box('p2-title','동의 · QR · 원격조회 · 선택적 PACS 편입 상세흐름',20,20,1870,55,'#FFFFFF','#FFFFFF',{fontSize:28,bold:true}));
const steps=[
 ['s1','1. A 병원 Study 선택','A Staff → A PACS\nCT/MRI Study·Series 선택\n원본은 A PACS 유지'],
 ['s2','2. 환자 동의','Purpose · Recipient\nStudy/Series Scope · Validity\nView / Import · Revocation'],
 ['s3','3. QR / Ticket 발급','opaque ticket · jti/nonce\nTTL · one-time · institution binding\nno PII · no DICOM · no key'],
 ['s4','4. B 의료진 인증','OIDC/OAuth + MFA\nprincipal · organization 검증\nQR만으로 인증하지 않음'],
 ['s5','5. QR 연결 · 정책 평가','RBAC + ABAC\n기관·의료진·환자·Study·목적·기간\nALLOW / DENY / EXPIRED / REVOKED / CONSUMED'],
 ['s6','6. QIDO-RS 검색','B Viewer → B Connector\nApproved Study Metadata\n허용 Study/Series만 반환'],
 ['s7','7. WADO-RS 원격조회','B Viewer ↔ B Edge ↔ Relay ↔ A Edge ↔ A PACS\nOn-demand Retrieval · Progressive Loading\nInstance / Multi-frame Frame · 생영상 Streaming 아님'],
 ['s8','8. 선택적 PACS 편입','Import Request → Separate Storage Policy\nSTOW-RS 또는 Legacy C-STORE\nManifest·UID·무결성·부분전송 검증']
];
for(let i=0;i<steps.length;i++){
  const row=i<4?0:1, col=i%4, x=30+col*470, y=row===0?120:390;
  p2.push(box(steps[i][0],`${steps[i][1]}\n\n${steps[i][2]}`,x,y,420,205,row===0?C.control:C.data,row===0?C.blue:C.orange,{fontSize:15,bold:true,align:'left'}));
}
for(let i=1;i<steps.length;i++) p2.push(edge(`flow${i}`,steps[i-1][0],steps[i][0],i===3?'B 병원에서 QR 제시':'',i<5?C.blue:C.orange,{width:i>=5?4:2}));
p2.push(box('auditbar','Audit Service — Issue · Scan · Validate · Allow/Deny · QIDO · WADO · STOW/C-STORE · Revoke · Expire · Delete\nactor principal · organization · patient reference · Study/Series · purpose · action · timestamp · result · correlation ID',30,630,1830,75,'#E2E8F0','#475569',{fontSize:14,bold:true}));
for(let i=0;i<steps.length;i++) p2.push(edge(`audit${i}`,steps[i][0],'auditbar','Audit','#64748B',{dashed:true,width:1}));
p2.push(box('failure-zone','Security / Failure Cases — 모두 Fail Closed',30,740,1830,230,'#FEF2F2',C.red,{fontSize:19,bold:true,align:'left'}));
const failures=[
 'QR 만료 → 접근 거부·새 요청','QR 재사용 → 보안 이벤트','타 기관 → binding 실패','타 Study → ABAC 거부',
 '동의 철회 → 미래 접근 차단','의료진 미인증 → 영상 미제공','A PACS 장애 → 직접 우회 금지','B PACS 실패 → 편입 실패 기록',
 '무결성 실패 → 복호화·편입 중지','인증서 만료 → mTLS 차단','캐시 TTL 초과 → 자동삭제·증적','감사 API 무권한 → 401/403'
];
for(let i=0;i<failures.length;i++){
 const col=i%4,row=Math.floor(i/4); p2.push(box(`f${i}`,failures[i],60+col*445,790+row*55,410,40,'#FFFFFF','#FCA5A5',{parent:'failure-zone',fontSize:12,align:'left'}));
}
p2.push(box('p2-legend','범례  파란 실선=제어·동의·권한  |  주황 굵은선=DICOM·Pixel Data  |  회색 점선=감사·선택  |  빨간 영역=거부·장애  |  🔒 TLS 1.3 · mTLS · AES-256-GCM',30,990,1830,38,'#F8FAFC','#CBD5E1',{fontSize:12}));
p2.push(box('p2-notice','A 병원 원본 유지 → 환자 동의·QR 발급 → B 의료진 인증 → 정책 승인 → QIDO-RS 검색 → WADO-RS 원격조회 → 필요 시 STOW-RS/C-STORE 편입 → 감사로그  |  캡스톤 PoC·합성 데이터',30,1035,1830,30,'#FFF7ED','#B45309',{fontSize:12,bold:true}));

function drawioPage(name, cells){
  const xml=[];
  const boxes=new Map(cells.filter(c=>c.type==='box').map(c=>[c.id,c]));
  const containers=new Set(['a-zone','cp-zone','dp-zone','sec-zone','b-zone','failure-zone']);
  xml.push('<mxGraphModel dx="1920" dy="1080" grid="1" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="1" pageScale="1" pageWidth="1920" pageHeight="1080" math="0" shadow="0"><root><mxCell id="0"/><mxCell id="1" parent="0"/>');
  for(const c of cells){
    if(c.type==='box'){
      const isContainer=containers.has(c.id), parentBox=boxes.get(c.parent);
      const gx=parentBox?c.x-parentBox.x:c.x, gy=parentBox?c.y-parentBox.y:c.y;
      const style=`rounded=${c.rounded?1:0};whiteSpace=wrap;html=1;fillColor=${c.fill};strokeColor=${c.stroke};strokeWidth=2;${c.dashed?'dashed=1;':''}fontColor=${C.text};fontSize=${c.fontSize};fontStyle=${c.bold?1:0};align=${c.align};verticalAlign=${isContainer?'top':'middle'};spacing=8;${isContainer?'spacingTop=10;':''}container=${isContainer?1:0};`;
      xml.push(`<mxCell id="${c.id}" value="${html(c.label)}" style="${style}" vertex="1" parent="${c.parent}"><mxGeometry x="${gx}" y="${gy}" width="${c.w}" height="${c.h}" as="geometry"/></mxCell>`);
    } else {
      const style=`edgeStyle=orthogonalEdgeStyle;rounded=0;orthogonalLoop=1;jettySize=auto;html=1;strokeColor=${c.color};strokeWidth=${c.width};${c.dashed?'dashed=1;':''}endArrow=${c.endArrow};endFill=1;fontSize=13;fontColor=${C.text};labelBackgroundColor=#FFFFFF;`;
      xml.push(`<mxCell id="${c.id}" value="${html(c.label)}" style="${style}" edge="1" parent="${c.parent}" source="${c.source}" target="${c.target}"><mxGeometry relative="1" as="geometry"/></mxCell>`);
    }
  }
  xml.push('</root></mxGraphModel>');
  return `<diagram id="${name}" name="${name}">${xml.join('')}</diagram>`;
}
const mxfile=`<?xml version="1.0" encoding="UTF-8"?>\n<mxfile host="app.diagrams.net" modified="2026-09-01T00:00:00.000Z" agent="Codex" version="24.7.17" type="device" compressed="false">${drawioPage('01_하이패스_서비스_구성도',p1)}${drawioPage('02_동의_QR_원격조회_편입_상세흐름',p2)}</mxfile>`;
fs.writeFileSync(path.join(outDir,`${base}.drawio`),mxfile,'utf8');

function svgPage(cells){
 const byId=new Map(cells.filter(c=>c.type==='box').map(c=>[c.id,c]));
 const containers=new Set(['a-zone','cp-zone','dp-zone','sec-zone','b-zone','failure-zone']);
 const defs=`<defs><marker id="arrow-blue" markerWidth="10" markerHeight="10" refX="9" refY="3" orient="auto"><path d="M0,0 L0,6 L9,3 z" fill="${C.blue}"/></marker><marker id="arrow-orange" markerWidth="10" markerHeight="10" refX="9" refY="3" orient="auto"><path d="M0,0 L0,6 L9,3 z" fill="${C.orange}"/></marker><marker id="arrow-purple" markerWidth="10" markerHeight="10" refX="9" refY="3" orient="auto"><path d="M0,0 L0,6 L9,3 z" fill="${C.purple}"/></marker><marker id="arrow-gray" markerWidth="10" markerHeight="10" refX="9" refY="3" orient="auto"><path d="M0,0 L0,6 L9,3 z" fill="#64748B"/></marker></defs>`;
 const parts=[`<svg xmlns="http://www.w3.org/2000/svg" xmlns:xhtml="http://www.w3.org/1999/xhtml" width="1920" height="1080" viewBox="0 0 1920 1080"><rect width="1920" height="1080" fill="#FFFFFF"/>${defs}`];
 for(const e of cells.filter(c=>c.type==='edge')){
  const a=byId.get(e.source),b=byId.get(e.target); if(!a||!b) continue;
  const x1=a.x+a.w/2,y1=a.y+a.h/2,x2=b.x+b.w/2,y2=b.y+b.h/2,mx=(x1+x2)/2;
  const marker=e.endArrow==='none'?'':` marker-end="url(#arrow-${e.color===C.orange?'orange':e.color===C.purple?'purple':e.color===C.blue?'blue':'gray'})"`;
  parts.push(`<path d="M${x1},${y1} H${mx} V${y2} H${x2}" fill="none" stroke="${e.color}" stroke-width="${e.width}" ${e.dashed?'stroke-dasharray="8 6"':''}${marker}/>`);
  if(e.label) parts.push(`<foreignObject x="${mx-100}" y="${(y1+y2)/2-14}" width="200" height="32"><xhtml:div style="font:12px 'Malgun Gothic',Arial;text-align:center;background:white;color:${C.text};padding:2px">${esc(e.label)}</xhtml:div></foreignObject>`);
 }
 for(const c of cells.filter(c=>c.type==='box')){
  const isContainer=containers.has(c.id);
  parts.push(`<rect x="${c.x}" y="${c.y}" width="${c.w}" height="${c.h}" rx="${c.rounded?10:0}" fill="${c.fill}" stroke="${c.stroke}" stroke-width="2" ${c.dashed?'stroke-dasharray="8 6"':''}/>`);
  if(!isContainer) parts.push(`<foreignObject x="${c.x+6}" y="${c.y+4}" width="${c.w-12}" height="${c.h-8}"><xhtml:div style="height:100%;display:flex;flex-direction:column;justify-content:center;align-items:${c.align==='left'?'flex-start':'center'};text-align:${c.align};white-space:pre-wrap;font:${c.bold?'700':'400'} ${c.fontSize}px 'Malgun Gothic',Arial;color:${C.text};line-height:1.25;padding:4px;box-sizing:border-box">${esc(c.label)}</xhtml:div></foreignObject>`);
 }
 for(const c of cells.filter(c=>c.type==='box' && containers.has(c.id))){
  parts.push(`<foreignObject x="${c.x+8}" y="${c.y+6}" width="${c.w-16}" height="58"><xhtml:div style="background:${c.fill};display:inline-block;text-align:left;white-space:pre-wrap;font:${c.bold?'700':'400'} ${c.fontSize}px 'Malgun Gothic',Arial;color:${C.text};line-height:1.25;padding:4px 6px;box-sizing:border-box">${esc(c.label)}</xhtml:div></foreignObject>`);
 }
 parts.push('</svg>'); return parts.join('');
}
for(const [suffix,cells] of [['',p1],['_page2',p2]]){
 const svg=svgPage(cells), svgPath=path.join(outDir,`${base}${suffix}.svg`);
 fs.writeFileSync(svgPath,svg,'utf8');
}
console.log(JSON.stringify({drawio:path.join(outDir,`${base}.drawio`),pages:2,p1Nodes:p1.length,p2Nodes:p2.length},null,2));
