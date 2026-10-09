import {createHash} from 'node:crypto';
const verified=new WeakSet();
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-8[a-f0-9]{3}-[a-f0-9]{12}$/;
const fail=()=>{throw Error('V3_SYNTHETIC_REGISTRY_INVALID');};
const exact=(object,keys)=>{if(!object||Object.getPrototypeOf(object)!==Object.prototype
 ||Object.keys(object).sort().join(',')!==[...keys].sort().join(','))fail();
 for(const key of keys)if(!Object.hasOwn(Object.getOwnPropertyDescriptor(object,key),'value'))fail();};
const scopes={HOSPITAL_ADMIN:['mapping:read','mapping:write'],SECURITY_ADMIN:['mapping:read','mapping:review'],DOCTOR:['mapping:read']};
export function validateCapstoneSyntheticRegistry(value){
 exact(value,['version','scope','issuer','audience','institutions','records']);
 if(![1,2].includes(value.version)||value.scope!=='CAPSTONE_SYNTHETIC_ONLY'||value.issuer!=='highpass-v3-capstone-mock'
 ||value.audience!=='highpass-v3-capstone-api'||!Array.isArray(value.institutions)||value.institutions.length!==2
 ||!Array.isArray(value.records)||value.records.length!==6)fail();
 const ids=new Set(),subjects=new Set();
 const institutions=value.institutions.map((item,index)=>{
  exact(item,['tenantId','hospitalId','code','displayName','authHospitalId']);const letter=index===0?'A':'B';
  if(!uuid.test(item.tenantId)||!uuid.test(item.hospitalId)||ids.has(item.tenantId)||ids.has(item.hospitalId)||item.tenantId===item.hospitalId
  ||item.code!=='SYNTHETIC-CAPSTONE-'+letter||item.displayName!=='SYNTHETIC '+letter+' UNIVERSITY HOSPITAL'||item.authHospitalId!=='CAPSTONE-'+letter)fail();
  ids.add(item.tenantId);ids.add(item.hospitalId);return Object.freeze({...item});
 });
 const records=value.records.map((item,index)=>{
  exact(item,['issuer','subject','tenantId','hospitalId','actorId','role','authHospitalId','status','scopes']);
  const institution=institutions[Math.floor(index/3)],role=['HOSPITAL_ADMIN','SECURITY_ADMIN','DOCTOR'][index%3];
  const subject='synthetic-capstone-'+(index<3?'a':'b')+'-'+['requester','reviewer','doctor'][index%3];
  const expectedScopes=value.version===2&&index===0?['mapping:read','mapping:write','exchange:create','exchange:read']:scopes[role];
  if(value.version===2){const prefix=index<3?'a':'b';
   if(item.tenantId!==prefix+'1000000-1000-4000-8000-000000000001'
    ||item.hospitalId!==prefix+'2000000-1000-4000-8000-000000000001'
    ||item.actorId!==prefix+'3000000-1000-4000-8000-00000000000'+(index%3+1))fail();
  }
  if(!uuid.test(item.actorId)||ids.has(item.actorId)||subjects.has(item.subject)||item.subject!==subject||item.issuer!==value.issuer
  ||item.tenantId!==institution.tenantId||item.hospitalId!==institution.hospitalId||item.authHospitalId!==institution.authHospitalId
  ||item.status!=='ACTIVE'||item.role!==role||!Array.isArray(item.scopes)||JSON.stringify(item.scopes)!==JSON.stringify(expectedScopes))fail();
  ids.add(item.actorId);subjects.add(item.subject);return Object.freeze({...item,scopes:Object.freeze([...item.scopes])});
 });
 const snapshot=Object.freeze({...value,institutions:Object.freeze(institutions),records:Object.freeze(records)});
 const bundle=Object.freeze({snapshot,sha256:createHash('sha256').update(JSON.stringify(snapshot)).digest('hex')});
 verified.add(bundle);return bundle;
}
/** Pure versioned transition; original version1 snapshot is never modified. */
export function buildCapstoneSourceExchangeRegistry(value){
 const original=validateCapstoneSyntheticRegistry(value);
 if(original.snapshot.version!==1)fail();
 const next=JSON.parse(JSON.stringify(original.snapshot));next.version=2;
 next.records[0].scopes.push('exchange:create','exchange:read');
 return validateCapstoneSyntheticRegistry(next);
}
export function buildCapstoneSyntheticRegistrySql(bundle,{targetDatabase}={}){
 if(!verified.has(bundle)||bundle.snapshot.version!==1||!['highpass_v3_capstone','highpass_v3_capstone_rehearsal'].includes(targetDatabase))fail();
 const quote=value=>"'"+value.replaceAll("'","''")+"'";
 const institutions=bundle.snapshot.institutions,records=bundle.snapshot.records;
 return `BEGIN;SET LOCAL statement_timeout=3000;SET LOCAL lock_timeout=1000;
 DO $$ BEGIN
 IF current_database()<>${quote(targetDatabase)} OR NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname=current_user AND rolsuper)
 THEN RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='SYNTHETIC_OPERATOR_REQUIRED'; END IF;
 PERFORM pg_advisory_xact_lock(194716032);
 IF EXISTS(SELECT 1 FROM highpass_v3.tenants) OR EXISTS(SELECT 1 FROM highpass_v3.hospitals)
 OR EXISTS(SELECT 1 FROM highpass_v3.principal_bindings)
 THEN RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='SYNTHETIC_REGISTRY_NOT_EMPTY'; END IF;
 END $$;
 INSERT INTO highpass_v3.tenants(tenant_id,code,display_name) VALUES ${institutions.map(i=>`(${quote(i.tenantId)},${quote(i.code)},${quote(i.displayName)})`).join(',')};
 INSERT INTO highpass_v3.hospitals(hospital_id,tenant_id,code) VALUES ${institutions.map(i=>`(${quote(i.hospitalId)},${quote(i.tenantId)},${quote(i.code)})`).join(',')};
 INSERT INTO highpass_v3.principal_bindings(actor_id,tenant_id,hospital_id,role,scopes,status) VALUES ${records.map(r=>`(${quote(r.actorId)},${quote(r.tenantId)},${quote(r.hospitalId)},${quote(r.role)},ARRAY[${r.scopes.map(quote).join(',')}],'ACTIVE')`).join(',')};
 COMMIT;`;
}
