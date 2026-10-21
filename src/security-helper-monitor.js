import {request} from 'node:http';

export function summarizeHelper(events){
  const logs=events.filter(e=>e.action==='HEALTH_HELPER_REQUEST'),groups=new Map();let unlinked=0;
  for(const event of logs){if(!event.auditSessionId||event.auditSessionId==='UNKNOWN'){unlinked++;continue;}const key=event.auditSessionId;if(!groups.has(key))groups.set(key,[]);groups.get(key).push(event);}
  const counts={generated:0,evidence:0,safe:0,failed:0,unknown:0},durations=[];
  for(const rows of groups.values()){
    rows.sort((a,b)=>a.time.localeCompare(b.time));
    const terminal=rows.filter(e=>!/_STARTED$/.test(e.reasonCode)).at(-1);
    const reason=terminal?.reasonCode||'';
    const kind=!terminal?'unknown':['FAIL','DENIED','ERROR'].includes(terminal.result)?'failed':/GENERATED$/.test(reason)?'generated':/REFUSED$/.test(reason)?'safe':/EVIDENCE|SOURCE_GUIDANCE|SCENARIO_PROVENANCE/.test(reason)?'evidence':'unknown';counts[kind]++;
    const start=rows.find(e=>/_STARTED$/.test(e.reasonCode));if(start&&terminal){const ms=Date.parse(terminal.time)-Date.parse(start.time);if(ms>=0)durations.push(ms);}
  }
  durations.sort((a,b)=>a-b);
  return {logCount:logs.length,requestCount:groups.size,unlinked,counts,pairedCount:durations.length,
    medianMs:durations.length?durations[Math.floor((durations.length-1)*.5)]:null,p95Ms:durations.length?durations[Math.ceil(durations.length*.95)-1]:null,
    lastEventAt:logs.map(e=>e.time).sort().at(-1)||null};
}

// Fixed private socket; no supplied URL, model generation, prompts or patient data.
export function probeHelper(env=process.env){
  const observedAt=new Date().toISOString();
  if(env.HIPASS_HEALTH_HELPER_MODEL!=='ollama'||env.HIPASS_HELPER_SOCKET!=='/run/helper/ollama.sock')return Promise.resolve({observedAt,transport:'NOT_CONFIGURED',relay:'UNKNOWN',model:'UNKNOWN'});
  return new Promise(resolve=>{
    let finished=false;const done=value=>{if(finished)return;finished=true;clearTimeout(timer);resolve({observedAt,...value});};
    const req=request({socketPath:'/run/helper/ollama.sock',path:'/health',method:'GET'},res=>{
      let body='';res.on('data',chunk=>{body+=chunk;if(body.length>4096)res.destroy();});
      res.on('error',()=>done({transport:'REACHABLE',relay:'UNKNOWN',model:'UNKNOWN'}));
      res.on('end',()=>{try{const v=JSON.parse(body);if(res.statusCode!==200||v.service!=='health-helper-relay')throw Error();done({transport:'REACHABLE',relay:'READY',model:['AVAILABLE','UNAVAILABLE'].includes(v.model)?v.model:'UNKNOWN',modelName:v.modelName==='qwen3.5:4b'?v.modelName:undefined});}catch{done({transport:'REACHABLE',relay:'UNKNOWN',model:'UNKNOWN'});}});
    });
    const timer=setTimeout(()=>{done({transport:'UNAVAILABLE',relay:'UNKNOWN',model:'UNKNOWN'});req.destroy();},3000);
    req.on('error',()=>done({transport:'UNAVAILABLE',relay:'UNKNOWN',model:'UNKNOWN'}));req.end();
  });
}
let cached=null,inflight=null;
export async function helperConnectionStatus(){
  if(cached&&Date.now()-Date.parse(cached.observedAt)<30000)return cached;
  if(!inflight)inflight=probeHelper().then(value=>cached=value).finally(()=>inflight=null);
  return inflight;
}
