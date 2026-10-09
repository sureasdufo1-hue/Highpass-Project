import {readFileSync} from 'node:fs';

// Capstone entrypoint-only secret loading. No database mutation or policy fallback.
export function loadCapstonePatientRuntimeSecrets(env=process.env,readFile=readFileSync){
  if(env.HIPASS_CAPSTONE_PATIENT_GRANTS!=='1'){
    if(env.HIPASS_CAPSTONE_PATIENT_KEY_RELEASE==='1')throw new Error('PATIENT_RUNTIME_PROFILE_REQUIRED');
    return;
  }
  if(env.HIPASS_CONTROL_PLANE_ONLY!=='1' || env.AUTH_MODE!=='TEST' || env.HIPASS_STORE!=='postgres'
    || env.HIPASS_CAPSTONE_SINGLE_WRITER!=='1' || env.POSTGRES_HOST!=='postgres' || env.POSTGRES_DB!=='hipass'
    || (env.HIPASS_PATIENT_AUTHORITY_DATABASE_USER && env.HIPASS_PATIENT_AUTHORITY_DATABASE_USER!=='hipass_patient_authority'))
    throw new Error('PATIENT_RUNTIME_PROFILE_REQUIRED');
  const secret=name=>{
    try{
      if(typeof env[name+'_FILE']!=='string' || !env[name+'_FILE'])throw new Error();
      const value=readFile(env[name+'_FILE'],'utf8').trim();
      if(value.length<32 || value.length>256 || /[\r\n\0]/.test(value))throw new Error();
      return value;
    }catch{throw new Error('PATIENT_RUNTIME_SECRET_INVALID');}
  };
  const password=secret('HIPASS_PATIENT_AUTHORITY_PASSWORD');
  const pending={HIPASS_PATIENT_SELF_VIEW_SERVICE_TOKEN:secret('HIPASS_PATIENT_SELF_VIEW_SERVICE_TOKEN')};
  if(env.HIPASS_CAPSTONE_PATIENT_KEY_RELEASE==='1')pending.HIPASS_PATIENT_KEY_RELEASE_SERVICE_TOKEN=secret('HIPASS_PATIENT_KEY_RELEASE_SERVICE_TOKEN');
  const existing=['POSTGRES_PASSWORD','DICOM_TOKEN_SECRET','TEST_JWT_SECRET','HIPASS_INGRESS_SECRET',
    'HIPASS_DATA_PLANE_SERVICE_TOKEN','HIPASS_KEY_RELEASE_SERVICE_TOKEN','HIPASS_CAPSTONE_LOGIN_KEY',
    'HIPASS_INTERNAL_SERVICE_TOKEN','HIPASS_PRIVACY_SERVICE_TOKEN'].map(name=>env[name]).filter(Boolean);
  const distinct=[password,...Object.values(pending)];
  if(new Set(distinct).size!==distinct.length || distinct.some(value=>existing.includes(value)))throw new Error('PATIENT_RUNTIME_SECRET_REUSED');
  const port=env.POSTGRES_PORT??'5432';
  if(!/^[1-9][0-9]{0,4}$/.test(port) || Number(port)>65535)throw new Error('PATIENT_RUNTIME_PROFILE_REQUIRED');
  // This cannot silently borrow the broader hipass_app connection or an injected superuser URI.
  pending.HIPASS_PATIENT_AUTHORITY_DATABASE_URL=`postgresql://hipass_patient_authority:${encodeURIComponent(password)}@postgres:${port}/hipass`;
  Object.assign(env,pending);
}
