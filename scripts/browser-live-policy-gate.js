import { randomUUID } from "node:crypto";

// Browser memory-only fixture. No signing secrets, access tokens or private keys
// are returned through CDP results, written to disk, or put in request URLs.
export async function runBrowserLivePolicyGate(client, profiles, origin, refreshProfiles) {
  if (origin !== "https://192.168.111.149:9443" || !profiles?.PATIENT || !profiles?.DOCTOR) throw new Error("POLICY_GATE_CONTEXT_REQUIRED");
  const slot = "__hpGate" + randomUUID().replaceAll("-", "");
  const evaluate = async expression => {
    const result = await client.send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true }, 120000);
    if (result.exceptionDetails) {
      const description = result.exceptionDetails.exception?.description ?? "";
      const safe = ["CREATE_DENIED", "ISSUE_DENIED", "TOKEN_CONTRACT_INVALID"].find(code => description.startsWith("Error: " + code));
      throw new Error(safe ?? "POLICY_GATE_BROWSER_REQUEST_FAILED");
    }
    if (!result.result?.value) throw new Error("POLICY_GATE_EVALUATION_FAILED");
    return result.result.value;
  };
  const checks = [];
  let failedStage;
  try {
    const initial = await evaluate(`(async () => {
      const checks=[]; let stage='INITIALIZE_BROWSER_PROOF';
      const owned=[];
      try {
      const profiles = ${JSON.stringify(profiles)};
      const origin = ${JSON.stringify(origin)};
      const key = await crypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'}, false, ['sign','verify']);
      const jwk = await crypto.subtle.exportKey('jwk', key.publicKey);
      const encode = bytes => btoa(String.fromCharCode(...new Uint8Array(bytes))).replaceAll('+','-').replaceAll('/','_').replaceAll('=','');
      const json = value => encode(new TextEncoder().encode(JSON.stringify(value)));
      const digest = value => crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)).then(encode);
      const proof = async (method,path,token) => {
        const input = json({typ:'dpop+jwt',alg:'ES256',jwk}) + '.' + json({jti:crypto.randomUUID(),htm:method,htu:origin+path,iat:Math.floor(Date.now()/1000),...(token ? {ath:await digest(token)} : {})});
        return input+'.'+encode(await crypto.subtle.sign({name:'ECDSA',hash:'SHA-256'},key.privateKey,new TextEncoder().encode(input)));
      };
      const api = async (method,path,role,body,withProof=false) => {
        const response = await fetch(path,{method,headers:{'content-type':'application/json',Authorization:'Bearer '+profiles[role],...(withProof ? {DPoP:await proof(method,path)} : {})},body:body ? JSON.stringify(body) : undefined,cache:'no-store',signal:AbortSignal.timeout(10000)});
        return {status:response.status,body:await response.json()};
      };
      const study='1.2.410.100.1.20260620.001', series=study+'.1', instance=series+'.1';
      const imagePath='/dicomweb/studies/'+study+'/series/'+series+'/instances/'+instance+'/rendered';
      const image = async (path,token) => {
        const response=await fetch(path,{headers:{Authorization:'DPoP '+token,DPoP:await proof('GET',path,token)},cache:'no-store',signal:AbortSignal.timeout(35000)});
        const contentType=response.headers.get('content-type') || '';
        await response.body?.cancel();
        return {httpStatus:response.status,imageReturned:contentType.startsWith('image/')};
      };
      const create = async seconds => {
        stage='CREATE_CONSENT_HTTP';
        const created=await api('POST','/api/consents','PATIENT',{patientId:'P-1001',sourceHospitalId:'HOSP-A',targetHospitalId:'HOSP-B',purpose:'TREATMENT',permission:'VIEW_ONLY',validFrom:new Date(Date.now()-60000).toISOString(),validUntil:new Date(Date.now()+seconds*1000).toISOString(),scopes:[{studyInstanceUid:study,seriesInstanceUid:series}]});
        if(created.status!==201 || created.body.status!=='ACTIVE') throw new Error('CREATE_DENIED');
        const consentId=created.body.consentId;
        const fixture={consentId}; owned.push(fixture);
        stage='ISSUE_BOUND_TOKEN_HTTP';
        const issued=await api('POST','/api/dicom-access/request','DOCTOR',{consentId,doctorId:'DOC-B-01',requestingHospitalId:'HOSP-B',studyInstanceUid:study,seriesInstanceUid:series,purpose:'TREATMENT',requestedAction:'VIEW'},true);
        if(issued.status!==200 || issued.body.decision!=='ALLOWED' || typeof issued.body.accessToken!=='string') throw new Error('ISSUE_DENIED');
        const token=issued.body.accessToken;
        const claims=JSON.parse(atob(token.split('.')[1].replaceAll('-','+').replaceAll('_','/')));
        const expiry=Date.parse(claims.expiresAt);
        const issuedAt=Date.parse(claims.issuedAt), issuedMonotonic=performance.now();
        const tokenLifetimeMs=expiry-issuedAt,consentLifetimeMs=Date.parse(created.body.validUntil)-issuedAt;
        if(!Number.isFinite(tokenLifetimeMs) || tokenLifetimeMs<=0 || tokenLifetimeMs>600000 || !Number.isFinite(consentLifetimeMs) || consentLifetimeMs<=0 || !claims.cnf?.jkt) throw new Error('TOKEN_CONTRACT_INVALID');
        Object.assign(fixture,{token,expiry,issuedMonotonic,tokenLifetimeMs,consentLifetimeMs});
        return fixture;
      };
      const revoke = fixture => api('POST','/api/consents/'+fixture.consentId+'/revoke','PATIENT',{});
      const inspect = fixture => api('GET','/api/consents/'+fixture.consentId,'PATIENT');
      window[${JSON.stringify(slot)}]={profiles,create,image,imagePath,revoke,inspect,owned};
      stage='CREATE_LIVE_FIXTURE'; const fixture=await create(900);
      window[${JSON.stringify(slot)}].fixture=fixture;
      stage='LIVE_CONSENT_REAL_ENCRYPTED_IMAGE'; const normal=await image(imagePath,fixture.token);
      checks.push({test:stage,...normal,status:normal.httpStatus===200 && normal.imageReturned ? 'PASS':'FAIL'});
      for(const [test,path,token] of [
        ['OTHER_STUDY_DENIED',imagePath.replace(study,'1.2.410.100.1.20260518.002'),fixture.token],
        ['OTHER_SERIES_DENIED',imagePath.replaceAll(series,study+'.2'),fixture.token],
        ['VIEW_ONLY_DOWNLOAD_DENIED',imagePath.replace('/rendered','/download'),fixture.token],
        ['TAMPERED_TOKEN_DENIED',imagePath,fixture.token.slice(0,-2)+(fixture.token.at(-2)==='A'?'B':'A')+fixture.token.at(-1)]
      ]) {
        stage=test;
        const result=await image(path,token);
        checks.push({test,...result,status:[401,403].includes(result.httpStatus) && !result.imageReturned ? 'PASS':'FAIL'});
      }
      stage='OWNED_PATIENT_CONSENT_REVOKE'; const revoked=await revoke(fixture);
      checks.push({test:'OWNED_PATIENT_CONSENT_REVOKE',httpStatus:revoked.status,status:revoked.status===200 && revoked.body.status==='REVOKED'?'PASS':'FAIL'});
      stage='SAME_TOKEN_FRESH_PROOF_AFTER_REVOKE_DENIED'; const denied=await image(imagePath,fixture.token);
      checks.push({test:'SAME_TOKEN_FRESH_PROOF_AFTER_REVOKE_DENIED',...denied,status:denied.httpStatus===403 && !denied.imageReturned ? 'PASS':'FAIL'});
      // Consent is deliberately short but must still allow the preserved
      // anti-abuse delay and actual crypto roundtrip before testing expiry.
      stage='CREATE_EXPIRING_CONSENT'; const expiring=await create(60);
      window[${JSON.stringify(slot)}].expiring=expiring;
      stage='EXPIRING_CONSENT_IMAGE_BEFORE_DEADLINE'; const expiryNormal=await image(imagePath,expiring.token);
      checks.push({test:'EXPIRING_CONSENT_IMAGE_BEFORE_DEADLINE',...expiryNormal,status:expiryNormal.httpStatus===200 && expiryNormal.imageReturned?'PASS':'FAIL'});
      return {checks,consentWaitMs:Math.max(0,expiring.issuedMonotonic+expiring.consentLifetimeMs-performance.now()+1000)};
      } catch(error) {
        const approved=['CREATE_DENIED','ISSUE_DENIED','TOKEN_CONTRACT_INVALID'];
        const reason=approved.includes(error.message) ? error.message : error.name==='TimeoutError' ? 'BROWSER_REQUEST_TIMEOUT' : 'BROWSER_REQUEST_FAILED';
        return {checks,gateStage:stage,gateError:reason};
      }
    })()`);
    checks.push(...initial.checks);
    if(initial.gateError) {
      const stages=["INITIALIZE_BROWSER_PROOF","CREATE_LIVE_FIXTURE","CREATE_CONSENT_HTTP","ISSUE_BOUND_TOKEN_HTTP","LIVE_CONSENT_REAL_ENCRYPTED_IMAGE","OTHER_STUDY_DENIED","OTHER_SERIES_DENIED","VIEW_ONLY_DOWNLOAD_DENIED","TAMPERED_TOKEN_DENIED","OWNED_PATIENT_CONSENT_REVOKE","SAME_TOKEN_FRESH_PROOF_AFTER_REVOKE_DENIED","CREATE_EXPIRING_CONSENT","EXPIRING_CONSENT_IMAGE_BEFORE_DEADLINE"];
      failedStage=stages.includes(initial.gateStage)?initial.gateStage:"UNKNOWN_STAGE";
      throw new Error(initial.gateError);
    }
    if (!Number.isFinite(initial.consentWaitMs) || initial.consentWaitMs > 90000) throw new Error("CONSENT_DEADLINE_INVALID");
    await new Promise(resolve => setTimeout(resolve, initial.consentWaitMs));
    const expiry = await evaluate(`(async()=>{
      const gate=window[${JSON.stringify(slot)}];
      const tokenStillValid=performance.now()-gate.expiring.issuedMonotonic<gate.expiring.tokenLifetimeMs-2000;
      const result=await gate.image(gate.imagePath,gate.expiring.token);
      const check={test:'ELAPSED_CONSENT_EXPIRY_WITH_UNEXPIRED_TOKEN_DENIED',...result,tokenStillValid,status:tokenStillValid && result.httpStatus===403 && !result.imageReturned?'PASS':'FAIL'};
      const fixture=await gate.create(900); gate.tokenExpiryFixture=fixture;
      const normal=await gate.image(gate.imagePath,fixture.token);
      return {checks:[check,{test:'TOKEN_EXPIRY_FIXTURE_INITIAL_IMAGE',...normal,status:normal.httpStatus===200 && normal.imageReturned?'PASS':'FAIL'}],tokenWaitMs:Math.max(0,fixture.issuedMonotonic+fixture.tokenLifetimeMs-performance.now()+1000)};
    })()`);
    checks.push(...expiry.checks);
    if (!Number.isFinite(expiry.tokenWaitMs) || expiry.tokenWaitMs > 601000) throw new Error("TOKEN_DEADLINE_INVALID");
    // Normal runtime TTL is retained. No clock patch, shortened TTL, fixture
    // signature forging or application restart is used to claim expiry.
    await new Promise(resolve => setTimeout(resolve, expiry.tokenWaitMs));
    const final = await evaluate(`(async()=>{
      const gate=window[${JSON.stringify(slot)}],fixture=gate.tokenExpiryFixture;
      const elapsedMs=performance.now()-fixture.issuedMonotonic;
      const tokenExpired=elapsedMs>=fixture.tokenLifetimeMs+1000, consentStillValid=elapsedMs<fixture.consentLifetimeMs-2000;
      const result=await gate.image(gate.imagePath,fixture.token);
      return {test:'ELAPSED_REAL_TOKEN_EXPIRY_FRESH_PROOF_DENIED',...result,tokenExpired,consentStillValid,status:tokenExpired && consentStillValid && result.httpStatus===403 && !result.imageReturned?'PASS':'FAIL'};
    })()`);
    checks.push(final);
  } catch (error) {
    const safe = ["CREATE_DENIED", "ISSUE_DENIED", "TOKEN_CONTRACT_INVALID", "CDP_COMMAND_TIMEOUT", "CONSENT_DEADLINE_INVALID", "TOKEN_DEADLINE_INVALID", "POLICY_GATE_BROWSER_REQUEST_FAILED", "POLICY_GATE_EVALUATION_FAILED", "BROWSER_REQUEST_TIMEOUT", "BROWSER_REQUEST_FAILED"];
    checks.push({test:"LIVE_POLICY_GATE",status:"NOT VERIFIED",reason:safe.includes(error.message)?error.message:"REQUEST_PROOF_OR_RESPONSE_FAILED",...(failedStage?{stage:failedStage}:{})});
  } finally {
    try {
      if (refreshProfiles) {
        const refreshed = await refreshProfiles();
        await evaluate(`(() => { const gate=window[${JSON.stringify(slot)}]; if(!gate) return {ok:false}; Object.assign(gate.profiles,${JSON.stringify(refreshed)}); return {ok:true}; })()`);
      }
      const cleanup=await evaluate(`(async()=>{
        const gate=window[${JSON.stringify(slot)}];
        if(!gate) return {status:'NOT VERIFIED'};
        // Only revoke this gate's owned synthetic consents. Never delete audit.
        // Five-minute Mock IdP sessions may have expired by this point; expiry
        // alone is not reported as successful cleanup.
        let allInactive=gate.owned.length>0; const unresolvedConsentIds=[],effectiveStates=[];
        for(const fixture of gate.owned) {
          try {
            let response=await gate.inspect(fixture);
            if(response.status===200 && response.body.consentId===fixture.consentId && response.body.status==='ACTIVE') {
              await gate.revoke(fixture); response=await gate.inspect(fixture);
            }
            const inactive=response.status===200 && response.body.consentId===fixture.consentId && ['REVOKED','EXPIRED'].includes(response.body.status);
            if(!inactive) { allInactive=false; unresolvedConsentIds.push(fixture.consentId); }
            else effectiveStates.push({consentId:fixture.consentId,status:response.body.status});
          } catch { allInactive=false; unresolvedConsentIds.push(fixture.consentId); }
        }
        const createdConsentIds=gate.owned.map(fixture=>fixture.consentId);
        delete window[${JSON.stringify(slot)}];
        return {status:allInactive?'PASS':'NOT VERIFIED',createdConsentIds,effectiveStates,unresolvedConsentIds,cleanupMeaning:'OWNED_AUTHORITY_INACTIVE_VERIFIED_NOT_DELETION_OR_EXPIRY_AS_REVOCATION'};
      })()`);
      checks.push({test:"OWNED_SYNTHETIC_CONSENT_CLEANUP",...cleanup});
    } catch {
      await client.send("Runtime.evaluate",{expression:`delete window[${JSON.stringify(slot)}]`}).catch(()=>{});
      checks.push({test:"OWNED_SYNTHETIC_CONSENT_CLEANUP",status:"NOT VERIFIED"});
    }
  }
  return {scope:"ACTUAL_ENCRYPTED_BROWSER_LIVE_POLICY",review:"DRAFT / UNASSIGNED",checks,result:checks.every(check=>check.status==="PASS")?"PASS":checks.some(check=>check.status==="FAIL")?"FAIL":"NOT VERIFIED"};
}
