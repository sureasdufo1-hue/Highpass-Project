import https from "node:https";
import { readFileSync } from "node:fs";
import { createDataPlaneHandler } from "../src/data-plane-gateway.js";
import { createPatientDataPlaneHandler } from "../src/patient-data-plane-gateway.js";
import { createCapstoneImageEncryptor } from "../src/capstone-encrypted-transfer.js";
import { hospitalKeyConfig } from "./capstone-hospital-key-config.js";
import { createRuntimeDiagnosticFactory } from "../src/capstone-runtime-diagnostics.js";

const file = name => readFileSync(required(name));
const encryptionRequired = process.env.CAPSTONE_IMAGE_ENCRYPTION_REQUIRED === "1";
const crypto = encryptionRequired ? hospitalKeyConfig("A") : null;
const handler = createDataPlaneHandler({ publicBaseUrl: required("DATA_PLANE_PUBLIC_BASE_URL"),
  controlOrigin: required("DATA_PLANE_CONTROL_ORIGIN"), orthancOrigin: required("DATA_PLANE_ORTHANC_ORIGIN"),
  serviceToken: file("DATA_PLANE_SERVICE_TOKEN_FILE").toString("utf8").trim(),
  controlTls: { ca: file("DATA_PLANE_CONTROL_CA_FILE") },
  orthancTls: { ca: file("DATA_PLANE_ORTHANC_CA_FILE"), cert: file("DATA_PLANE_ORTHANC_CERT_FILE"), key: file("DATA_PLANE_ORTHANC_KEY_FILE"), servername: required("DATA_PLANE_ORTHANC_SERVERNAME") },
  diagnosticFactory: createRuntimeDiagnosticFactory(process.env),
  encryptionRequired, ...(crypto ? { imageEncryptionFactory: control => createCapstoneImageEncryptor({ ...crypto, control }) } : {}) });
let patientHandler=null;
if(process.env.CAPSTONE_PATIENT_SELF_VIEW_GATEWAY==='1'){
  const patientToken=file('PATIENT_DATA_PLANE_SERVICE_TOKEN_FILE').toString('utf8').trim();
  if(patientToken===file('DATA_PLANE_SERVICE_TOKEN_FILE').toString('utf8').trim())throw new Error('PATIENT_GATEWAY_CREDENTIAL_MUST_BE_SEPARATE');
  patientHandler=createPatientDataPlaneHandler({publicBaseUrl:required('DATA_PLANE_PUBLIC_BASE_URL'),
    controlOrigin:required('DATA_PLANE_CONTROL_ORIGIN'),orthancOrigin:required('DATA_PLANE_ORTHANC_ORIGIN'),serviceToken:patientToken,
    sourceHospitalId:required('PATIENT_DATA_PLANE_SOURCE_HOSPITAL_ID'),controlTls:{ca:file('DATA_PLANE_CONTROL_CA_FILE')},
    orthancTls:{ca:file('DATA_PLANE_ORTHANC_CA_FILE'),cert:file('DATA_PLANE_ORTHANC_CERT_FILE'),key:file('DATA_PLANE_ORTHANC_KEY_FILE'),servername:required('DATA_PLANE_ORTHANC_SERVERNAME')}
    // Patient Key Vault adapter is not wired yet: pixels fail closed before PACS read.
  });
}
const server = https.createServer({ cert: file("DATA_PLANE_TLS_CERT_FILE"), key: file("DATA_PLANE_TLS_KEY_FILE") },(request,response)=>{
  if(request.url?.startsWith('/patient-dicomweb/')){
    if(patientHandler)return patientHandler(request,response);
    response.writeHead(503,{'content-type':'application/json','cache-control':'no-store'});response.end(JSON.stringify({error:'PATIENT_GATEWAY_DISABLED'}));return;
  }
  return handler(request,response);
});
server.headersTimeout = 10000;
server.requestTimeout = 10000;
server.timeout = 25000;
server.keepAliveTimeout = 5000;
server.listen(Number(process.env.DATA_PLANE_PORT ?? 8443), () => console.log("Data Plane Gateway listener ready; distributed MVP NOT VERIFIED"));
function required(name) { if (!process.env[name]) throw new Error(`${name} required`); return process.env[name]; }
