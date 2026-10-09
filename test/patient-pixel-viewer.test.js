import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {createPatientPixelSession} from '../public/patient-pixel-viewer.js';
const now=Date.now(),iat=Math.floor(now/1000);
const token='header.'+Buffer.from(JSON.stringify({iat,exp:iat+300})).toString('base64url')+'.signature';
const study={studyInstanceUid:'1.2.3',series:[{seriesInstanceUid:'1.2.3.1'}]};
function fixture({foreign=false,status=200}={}){
  const calls=[];
  const fetcher=async(url,options)=>{
    calls.push({url,options});
    if(url.endsWith('/self-view-grants'))return Response.json({accessToken:token,tokenType:'DPoP',permission:'VIEW_ONLY',expiresAt:new Date((iat+300)*1000).toISOString()},{status});
    if(url.endsWith('/instances'))return Response.json([{'0020000D':{Value:[foreign?'1.2.4':'1.2.3']},'0020000E':{Value:['1.2.3.1']},'00080018':{Value:['1.2.3.1.1']}}]);
    return new Response(new Uint8Array([1,2,3]),{headers:{'content-type':'image/png'}});
  };
  return {calls,args:{patientId:'SYNTHETIC',study,headers:{authorization:'Bearer synthetic-auth-fixture'},origin:'https://synthetic.invalid',fetcher,webCrypto:webcrypto,clock:()=>now}};
}
test('patient viewer issues a single-Series Grant then fetches actual instance pixels with fresh bound proofs',async()=>{
  const f=fixture(),s=await createPatientPixelSession(f.args);assert.equal(s.count,1);assert.equal((await s.frame(0)).size,3);
  assert.equal(f.calls.length,3);assert.deepEqual(JSON.parse(f.calls[0].options.body),{seriesInstanceUids:['1.2.3.1']});
  const proofs=f.calls.map(c=>JSON.parse(Buffer.from(c.options.headers.get('dpop').split('.')[1],'base64url')));
  assert.equal(new Set(proofs.map(p=>p.jti)).size,3);assert.equal(proofs[0].ath,undefined);assert.ok(proofs[1].ath);assert.equal(proofs[1].ath,proofs[2].ath);
  for(const c of f.calls){assert.equal(new URL(c.url).search,'');assert.ok(!c.url.includes(token));assert.equal(c.options.cache,'no-store');assert.ok(c.options.signal);}
  assert.equal(f.calls[1].options.headers.get('authorization'),'DPoP '+token);
  s.close();await assert.rejects(s.frame(0),/EXPIRED/);assert.equal(f.calls.length,3);
});
test('denied Grant and foreign metadata never fall back to mock pixels',async()=>{
  for(const settings of [{status:403},{foreign:true}]){
    const f=fixture(settings);await assert.rejects(createPatientPixelSession(f.args),/DENIED|SCOPE_INVALID/);
    assert.ok(!f.calls.some(c=>c.url.endsWith('/rendered')));
  }
});
test('client expiry blocks new fetch; receiver clock offset does not enlarge signed token lifetime',async()=>{
  const f=fixture();let clock=now-3000;f.args.clock=()=>clock;
  const s=await createPatientPixelSession(f.args);clock=(iat+300)*1000;await assert.rejects(s.frame(0),/EXPIRED/);assert.equal(f.calls.length,2);
});
test('invalid UID and insecure origin reject before token issuance',async()=>{
  for(const change of [{origin:'http://synthetic.invalid'},{study:{...study,studyInstanceUid:'../wrong'}}]){
    const f=fixture();await assert.rejects(createPatientPixelSession({...f.args,...change}),/UNAVAILABLE/);assert.equal(f.calls.length,0);
  }
});
test('patient web and mobile entrypoints use the shared real pixel viewer; PWA caches only its public script',async()=>{
  for(const [file,fn] of [['app.js','openPatientStudyViewer'],['mobile/app.js','openCineViewer']]){
    const text=await readFile(new URL('../public/'+file,import.meta.url),'utf8');
    const body=text.match(new RegExp(`async function ${fn}\\([^)]*\\) \\{([\\s\\S]*?)\\n\\}`))?.[1];
    assert.ok(body);assert.match(body,/openPatientPixelViewer/);assert.doesNotMatch(body,/self-view`|draw.*Frame|RetiredIllustrative/);
  }
  const sw=await readFile(new URL('../public/mobile/sw.js',import.meta.url),'utf8');
  assert.match(sw,/"\/patient-pixel-viewer\.js"/);assert.match(sw,/request\.headers\.has\("authorization"\)/);
  assert.doesNotMatch(sw,/"\/patient-dicomweb\//);
});
