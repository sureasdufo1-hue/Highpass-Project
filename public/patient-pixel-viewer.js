// Patient-only capability and proof key live in RAM. No doctor-token fallback.
const uid=value=>typeof value==='string' && value.length<=64 && /^[0-9]+(?:\.[0-9]+)+$/.test(value)
  && value.split('.').every(part=>part==='0'||!part.startsWith('0'));
const base64=bytes=>btoa(String.fromCharCode(...new Uint8Array(bytes))).replaceAll('+','-').replaceAll('/','_').replaceAll('=','');

export async function createPatientPixelSession({patientId,study,seriesInstanceUid,headers,origin=location.origin,fetcher=fetch,webCrypto=crypto,clock=Date.now,signal}){
  const allowedSeries=study?.series?.map(row=>row?.seriesInstanceUid)??[];
  const series=seriesInstanceUid??allowedSeries[0];
  if(!patientId || !uid(study?.studyInstanceUid) || !uid(series) || new URL(origin).protocol!=='https:' || !webCrypto.subtle)
    throw new Error('PATIENT_VIEWER_UNAVAILABLE');
  if(!allowedSeries.includes(series))throw new Error('PATIENT_VIEWER_SCOPE_INVALID');
  const key=await webCrypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},false,['sign','verify']);
  const jwk=await webCrypto.subtle.exportKey('jwk',key.publicKey);
  let token='',expiresAt=0,closed=false;
  const request=async(path,{method='GET',body,issuance=false}={})=>{
    if(closed || (!issuance && clock()>=expiresAt))throw new Error('PATIENT_VIEWER_EXPIRED');
    const url=new URL(path,origin);
    if(url.origin!==origin || url.search || url.hash)throw new Error('PATIENT_VIEWER_UNAVAILABLE');
    const payload={jti:webCrypto.randomUUID(),htm:method,htu:url.origin+url.pathname,iat:Math.floor(clock()/1000)};
    const h=new Headers(issuance?headers:{authorization:'DPoP '+token});
    if(!issuance)payload.ath=base64(await webCrypto.subtle.digest('SHA-256',new TextEncoder().encode(token)));
    const input=base64(new TextEncoder().encode(JSON.stringify({typ:'dpop+jwt',alg:'ES256',jwk})))+'.'+base64(new TextEncoder().encode(JSON.stringify(payload)));
    h.set('dpop',input+'.'+base64(await webCrypto.subtle.sign({name:'ECDSA',hash:'SHA-256'},key.privateKey,new TextEncoder().encode(input))));
    if(body)h.set('content-type','application/json');
    const response=await fetcher(url.href,{method,headers:h,body:body?JSON.stringify(body):undefined,cache:'no-store',referrerPolicy:'no-referrer',
      signal:signal?AbortSignal.any([signal,AbortSignal.timeout(35000)]):AbortSignal.timeout(35000)});
    if(closed || (!issuance && clock()>=expiresAt))throw new Error('PATIENT_VIEWER_EXPIRED');
    if(!response.ok)throw new Error(response.status===401 || response.status===403?'PATIENT_VIEWER_DENIED':'PATIENT_VIEWER_UNAVAILABLE');
    return response;
  };
  try{
    const issued=await (await request(`/api/patients/${encodeURIComponent(patientId)}/studies/${study.studyInstanceUid}/self-view-grants`,
      {method:'POST',body:{seriesInstanceUids:[series]},issuance:true})).json();
    expiresAt=Date.parse(issued.expiresAt);
    let claims;try{claims=JSON.parse(atob(issued.accessToken.split('.')[1].replaceAll('-','+').replaceAll('_','/')));}catch{}
    if(issued.tokenType!=='DPoP' || issued.permission!=='VIEW_ONLY' || typeof issued.accessToken!=='string'
      || issued.accessToken.length>8192 || !Number.isFinite(expiresAt) || expiresAt<=clock()
      || !Number.isSafeInteger(claims?.iat) || !Number.isSafeInteger(claims?.exp) || claims.exp<=claims.iat
      || claims.exp-claims.iat>300 || expiresAt!==claims.exp*1000)
      throw new Error('PATIENT_VIEWER_UNAVAILABLE');
    token=issued.accessToken;
    const root=`/patient-dicomweb/studies/${study.studyInstanceUid}/series/${series}`;
    const rows=await (await request(root+'/instances')).json();
    if(!Array.isArray(rows) || !rows.length || rows.length>1000)throw new Error('PATIENT_VIEWER_UNAVAILABLE');
    const instances=rows.map(row=>{
      if(row['0020000D']?.Value?.[0]!==study.studyInstanceUid || row['0020000E']?.Value?.[0]!==series
        || !uid(row['00080018']?.Value?.[0]))throw new Error('PATIENT_VIEWER_SCOPE_INVALID');
      return row['00080018'].Value[0];
    });
    if(new Set(instances).size!==instances.length)throw new Error('PATIENT_VIEWER_SCOPE_INVALID');
    return {count:instances.length,expiresAt,seriesInstanceUid:series,
      async frame(index){
        if(!Number.isInteger(index) || index<0 || index>=instances.length)throw new Error('PATIENT_VIEWER_SCOPE_INVALID');
        const response=await request(root+'/instances/'+instances[index]+'/rendered');
        const type=response.headers.get('content-type')?.split(';')[0];
        if(!['image/png','image/jpeg'].includes(type))throw new Error('PATIENT_VIEWER_UNAVAILABLE');
        const blob=await response.blob();
        if(closed || clock()>=expiresAt || !blob.size || blob.size>8*1024*1024)throw new Error('PATIENT_VIEWER_UNAVAILABLE');
        return blob;
      },close(){closed=true;token='';}};
  }catch(error){closed=true;token='';throw error;}
}

// Polling can replace the launcher while the modal is open. Resolve only the
// same explicit action inside its original stable container, never another Study.
export function capturePatientViewerFocus(document,focus=document.activeElement){
  const attributes=['id','data-patient-view','data-action-view-study','data-patient-view-home','data-action-cine'];
  const identity=attributes.map(name=>[name,focus?.getAttribute?.(name)]).find(([,value])=>value);
  const container=focus?.parentElement?.closest?.('[id]'),containerId=container?.id;
  const usable=element=>element?.isConnected && !element.disabled && !element.closest?.('[inert]')
    && element.getClientRects().length>0;
  return ()=>{
    if(usable(focus)){focus.focus();return;}
    if(!identity)return;
    const root=containerId?document.getElementById(containerId):document;
    const replacement=Array.from(root?.querySelectorAll(`[${identity[0]}]`)??[])
      .find(element=>element.getAttribute(identity[0])===identity[1] && usable(element));
    replacement?.focus();
  };
}

let activeClose;
export async function openPatientPixelViewer({patientId,study,headers}){
  activeClose?.();
  const restoreFocus=capturePatientViewerFocus(document),dialog=document.createElement('dialog'),abort=new AbortController();
  dialog.id='patient-pixel-viewer';dialog.setAttribute('aria-label','합성 의료영상 본인 열람');
  dialog.style.cssText='width:min(92vw,760px);max-height:90dvh;padding:24px;border:1px solid #cbd5e1;border-radius:16px;';
  const title=document.createElement('h2');title.textContent=`${study.modality||'DICOM'} · ${study.description||'합성 의료영상'}`;
  const status=document.createElement('p');status.setAttribute('role','status');status.setAttribute('aria-live','polite');
  status.textContent='본인 열람 권한과 영상 목록을 확인하고 있습니다…';
  const image=document.createElement('img');image.alt='승인된 합성 DICOM에서 조회한 영상';image.hidden=true;
  image.style.cssText='width:100%;height:min(55dvh,500px);object-fit:contain;background:#0d1529;';
  const label=document.createElement('p');label.textContent='CAPSTONE · 합성 데이터 · VIEW_ONLY · 다운로드 불가';
  const seriesLabel=document.createElement('label');seriesLabel.textContent='영상 시리즈 ';
  const seriesSelect=document.createElement('select');seriesSelect.setAttribute('aria-label','영상 시리즈 선택');
  const seriesRows=Array.isArray(study.series)?study.series:[];
  for(const [index,row] of seriesRows.entries()){
    const option=document.createElement('option');option.value=row.seriesInstanceUid;
    option.textContent=row.description||`Series ${index+1}`;seriesSelect.append(option);
  }
  seriesLabel.append(seriesSelect);seriesLabel.hidden=seriesRows.length<2;
  const controls=document.createElement('div');controls.style.cssText='display:flex;gap:12px;flex-wrap:wrap';
  const button=text=>{const b=document.createElement('button');b.type='button';b.className='btn';b.textContent=text;b.style.minHeight='44px';controls.append(b);return b;};
  const previous=button('이전 영상'),next=button('다음 영상'),closeButton=button('닫기');
  previous.disabled=next.disabled=true;
  dialog.append(title,status,seriesLabel,image,label,controls);document.body.append(dialog);dialog.showModal();closeButton.focus();
  let session,sessionAbort,url,timer,index=0,closed=false,busy=false;
  const clear=()=>{image.removeAttribute('src');image.hidden=true;if(url)URL.revokeObjectURL(url);url=undefined;};
  const close=()=>{if(closed)return;closed=true;abort.abort();sessionAbort?.abort();clearTimeout(timer);session?.close();clear();dialog.close();dialog.remove();
    if(activeClose===close)activeClose=undefined;restoreFocus();};
  activeClose=close;closeButton.onclick=close;dialog.addEventListener('cancel',event=>{event.preventDefault();close();});
  const fail=error=>{clear();session?.close();previous.disabled=next.disabled=true;
    status.textContent=error.message==='PATIENT_VIEWER_EXPIRED'?'열람 기간이 만료되었습니다. 닫고 다시 승인받아 주세요.':
      error.message==='PATIENT_VIEWER_DENIED'?'현재 계정 또는 영상 범위로 열람할 수 없습니다. 다시 로그인해 확인해 주세요.':
      '영상을 불러오지 못했습니다. 연결과 시연 환경을 확인한 뒤 다시 시도하세요.';};
  const load=async()=>{
    if(closed || busy)return;busy=true;previous.disabled=next.disabled=true;clear();status.textContent='승인된 영상을 불러오고 있습니다…';
    try{const blob=await session.frame(index);if(closed)return;url=URL.createObjectURL(blob);image.src=url;
      let decodeTimer;try{await Promise.race([image.decode(),new Promise((_,reject)=>{decodeTimer=setTimeout(()=>reject(new Error('PATIENT_VIEWER_UNAVAILABLE')),5000);})]);}
      finally{clearTimeout(decodeTimer);}if(closed)return;image.hidden=false;
      status.textContent=`실제 합성 DICOM 영상 ${index+1} / ${session.count} · 승인된 Series · VIEW_ONLY`;
      previous.disabled=index===0;next.disabled=index===session.count-1;
    }catch(error){if(!closed)fail(error);}finally{busy=false;}
  };
  previous.onclick=()=>{if(!busy&&index>0){index--;load();}};
  next.onclick=()=>{if(!busy&&index<session.count-1){index++;load();}};
  const selectSeries=async seriesUid=>{
    if(closed||!seriesRows.some(row=>row.seriesInstanceUid===seriesUid))return;
    busy=true;previous.disabled=next.disabled=true;seriesSelect.disabled=true;clear();clearTimeout(timer);
    sessionAbort?.abort();session?.close();session=undefined;sessionAbort=new AbortController();index=0;
    status.textContent='선택한 시리즈의 본인 열람 권한을 확인하고 있습니다…';
    try{
      const created=await createPatientPixelSession({patientId,study,seriesInstanceUid:seriesUid,headers,signal:AbortSignal.any([abort.signal,sessionAbort.signal])});
      if(closed||sessionAbort.signal.aborted){created.close();return;}
      session=created;seriesSelect.disabled=false;busy=false;
      timer=setTimeout(()=>{if(!closed)fail(new Error('PATIENT_VIEWER_EXPIRED'));},Math.max(0,session.expiresAt-Date.now()));
      await load();
    }catch(error){if(!closed){seriesSelect.disabled=false;busy=false;fail(error);}}
  };
  seriesSelect.addEventListener('change',()=>selectSeries(seriesSelect.value));
  if(!seriesRows.length){fail(new Error('PATIENT_VIEWER_UNAVAILABLE'));return;}
  await selectSeries(seriesSelect.value||seriesRows[0].seriesInstanceUid);
}
