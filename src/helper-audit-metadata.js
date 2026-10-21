const id=v=>typeof v==='string'&&/^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/.test(v)?v:null;
// Strict allowlist: no prompts, answers, patient values or URLs.
export function safeHelperMetadata(v){
 if(!v||typeof v!=='object'||Array.isArray(v))return null;
 const sourceIds=[...new Set((Array.isArray(v.sourceIds)?v.sourceIds:[]).map(id).filter(Boolean))].slice(0,32);
 return {schemaVersion:1,configuredModel:id(v.configuredModel),modelVersion:id(v.modelVersion),corpusVersion:id(v.corpusVersion),medicalTestsVersion:id(v.medicalTestsVersion),sourceIds,sourceCount:sourceIds.length,generationUsed:typeof v.generationUsed==='boolean'?v.generationUsed:null,fallbackUsed:typeof v.fallbackUsed==='boolean'?v.fallbackUsed:null,failureCode:id(v.failureCode)};
}
export function helperResultMetadata(r={},configuredModel=null){return safeHelperMetadata({configuredModel,modelVersion:r.modelVersion,corpusVersion:r.corpusVersion,medicalTestsVersion:r.medicalTestsVersion,sourceIds:r.sources?.map(s=>s.id),generationUsed:r.generationUsed,fallbackUsed:typeof r.generationUsed==='boolean'?!r.generationUsed:null,failureCode:r.generationFailureReason});}
