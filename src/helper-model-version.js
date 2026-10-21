// Model-host observation, not a patient-supplied version or a remote attestation.
export const HELPER_MODEL='qwen3.5:4b';
export const validModelDigest=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
export async function modelSnapshot(fetchImpl=fetch,{signal,loaded=false}={}){
 const res=await fetchImpl(`http://127.0.0.1:11434/api/${loaded?'ps':'tags'}`,{signal,redirect:'error'});
 if(!res.ok)throw Error('MODEL_VERSION_UNVERIFIED');
 const body=await res.json();const matches=body.models?.filter(x=>x.name===HELPER_MODEL)??[];
 if(matches.length!==1)throw Error('MODEL_VERSION_UNVERIFIED');
 const model=matches[0];
 if(!validModelDigest(model?.digest))throw Error('MODEL_VERSION_UNVERIFIED');
 return model.digest;
}
export function verifyModelVersion(before,after,loaded,result){
 if(!validModelDigest(before)||before!==after||before!==loaded||result?.model!==HELPER_MODEL)
  throw Error('MODEL_VERSION_CHANGED');
 return before;
}
