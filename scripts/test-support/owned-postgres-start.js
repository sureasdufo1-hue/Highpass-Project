// Startup/cleanup protocol for disposable fixtures only. Not runtime orchestration.
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function validate({name,owner,label,docker}){
 if(typeof name!=='string'||!/^hp-v3-[a-z0-9-]{8,100}$/.test(name)||!uuid.test(owner??'')
  ||typeof label!=='string'||!/^highpass\.validation\.[a-z-]{1,64}$/.test(label)||typeof docker!=='function')
  throw Error('OWNED_FIXTURE_CONFIGURATION_INVALID');
}
function observe(phase,output,began){
 return Object.freeze({phase,exitCode:output.status??null,timedOut:output.error?.code==='ETIMEDOUT',durationMs:Date.now()-began});
}
function invoke(options,phase,args,timeout,observations){
 const began=Date.now(),r=options.docker(args,timeout);observations.push(observe(phase,r,began));return r;
}
function ownership(options,observations){
 const r=invoke(options,'OWNERSHIP', ['inspect','--type','container',options.name,'--format','{{json .Config.Labels}}'],15000,observations);
 if(r.status!==0)return false;
 try{return JSON.parse(r.stdout.trim())[options.label]===options.owner;}catch{return false;}
}
export function startOwnedPostgresFixture(options){
 validate(options);
 const {name,owner,label,password,mode='published'}=options,observations=[];
 if(typeof password!=='string'||!/^[a-f0-9]{64}$/.test(password)||!['none','bridge','published'].includes(mode))
  throw Error('OWNED_FIXTURE_CONFIGURATION_INVALID');
 const network=mode==='none'?['--network','none']:[],ports=mode==='published'?['-p','127.0.0.1::5432']:[];
 invoke(options,'CREATE',['create','--pull=never','--name',name,'--label',`${label}=${owner}`,
  '--memory','256m','--mount','type=tmpfs,destination=/var/lib/postgresql/data',...network,...ports,
  '-e',`POSTGRES_PASSWORD=${password}`,'postgres:16-alpine'],45000,observations);
 // A lost CLI response does not mean no container was created. Resolve the SAME
 // exact fixture, and do not start/delete an object without a full ownership match.
 const owned=ownership(options,observations);
 if(!owned)return Object.freeze({owned:false,running:false,observations});
 invoke(options,'START',['start',name],45000,observations);
 const state=invoke(options,'STATE',['inspect','--type','container',name,'--format','{{json .State}}'],15000,observations);
 let running=false;
 try{running=state.status===0&&JSON.parse(state.stdout.trim()).Running===true;}catch{}
 // Running is a state observation, NOT PG readiness/SQL/network PASS.
 return Object.freeze({owned:true,running,observations});
}
export function removeOwnedPostgresFixture(options){
 validate(options);const observations=[];
 const owned=ownership(options,observations);
 if(owned)invoke(options,'REMOVE',['rm','-f','-v',options.name],20000,observations);
 const absent=invoke(options,'ABSENCE',['container','ls','-aq','--filter',`name=^/${options.name}$`],15000,observations);
 // Inventory must succeed. Failed inspect or rm alone never establishes absence.
 const confirmedAbsent=absent.status===0&&absent.stdout.trim()==='';
 return Object.freeze({owned,absent:confirmedAbsent,observations});
}
export async function observeOwnedFixtureAbsence(options,{deadlineMs=15000,pollMs=500}={}){
 validate(options);
 if(!Number.isInteger(deadlineMs)||deadlineMs<50||deadlineMs>15000||!Number.isInteger(pollMs)||pollMs<50||pollMs>1000)
  throw Error('OWNED_FIXTURE_CONFIGURATION_INVALID');
 const observations=[],until=Date.now()+deadlineMs;
 while(Date.now()<until){
  const r=invoke(options,'ABSENCE_FOLLOWUP',['container','ls','-aq','--filter',`name=^/${options.name}$`],
   Math.max(1,Math.min(3000,until-Date.now())),observations);
  if(r.status===0&&r.stdout.trim()==='')return Object.freeze({absent:true,observations});
  const remaining=until-Date.now();if(remaining>0)await new Promise(resolve=>setTimeout(resolve,Math.min(pollMs,remaining)));
 }
 return Object.freeze({absent:false,observations});
}
