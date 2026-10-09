import https from "node:https";
import { readFileSync } from "node:fs";
import { createCapstoneBPortal } from "../src/capstone-b-portal.js";
import { createCapstoneImageDecryptor } from "../src/capstone-encrypted-transfer.js";
import {createPatientImageDecryptor} from '../src/patient-encrypted-transfer.js';
import { boundedHttps } from "../src/data-plane-gateway.js";
import { hospitalKeyConfig } from "./capstone-hospital-key-config.js";
import { createRuntimeDiagnosticFactory } from "../src/capstone-runtime-diagnostics.js";
const ca = readFileSync(process.env.CAPSTONE_B_CA_FILE);
const encryptionRequired = process.env.CAPSTONE_IMAGE_ENCRYPTION_REQUIRED === "1";
let imageDecryption;
if (encryptionRequired) {
  const serviceToken = readFileSync(process.env.CAPSTONE_B_KEY_RELEASE_TOKEN_FILE, "utf8").trim();
  if (serviceToken.length < 32 || serviceToken.length > 256 || /[\r\n\0]/u.test(serviceToken)) throw new Error("B_KEY_RELEASE_CREDENTIAL_INVALID");
  const control = async (path, body) => {
    if (path !== "/gateway/data-plane/package/authorize") throw new Error("B_KEY_RELEASE_ROUTE_INVALID");
    const result = await boundedHttps("https://10.90.88.1", path, { tls: { ca }, method: "POST",
      headers: { "content-type": "application/json", "x-hipass-service-token": serviceToken },
      // Existing anti-abuse delay can reach 5s; retain it and give the strict
      // TLS metadata call finite headroom rather than racing that same deadline.
      body: JSON.stringify(body), maxBytes: 32768, timeoutMs: 8000 });
    return { status: result.status, body: JSON.parse(result.body.toString("utf8")) };
  };
  imageDecryption = createCapstoneImageDecryptor({ ...hospitalKeyConfig("B"), control,
    publicBaseUrl: "https://192.168.111.149:9443", recipientHospitalId: "HOSP-B" });
}
const patientSelfViewEnabled=process.env.CAPSTONE_PATIENT_SELF_VIEW_GATEWAY==='1';
let patientImageDecryption;
if(patientSelfViewEnabled && process.env.CAPSTONE_PATIENT_IMAGE_ENCRYPTION_REQUIRED==='1'){
  if(!encryptionRequired)throw new Error('PATIENT_ENCRYPTION_PROFILE_REQUIRED');
  const patientToken=readFileSync(process.env.CAPSTONE_B_PATIENT_KEY_RELEASE_TOKEN_FILE,'utf8').trim();
  const doctorToken=readFileSync(process.env.CAPSTONE_B_KEY_RELEASE_TOKEN_FILE,'utf8').trim();
  if(Buffer.byteLength(patientToken)<32 || patientToken.length>256 || /[\r\n\0]/.test(patientToken) || patientToken===doctorToken)throw new Error('PATIENT_B_CREDENTIAL_INVALID');
  const control=async(path,body)=>{
    if(path!=='/gateway/patient-self-view/package/authorize')throw new Error('PATIENT_B_ROUTE_INVALID');
    const result=await boundedHttps('https://10.90.88.1',path,{tls:{ca},method:'POST',headers:{'content-type':'application/json','x-hipass-service-token':patientToken},
      body:JSON.stringify(body),maxBytes:32768,timeoutMs:8000});return {status:result.status,body:JSON.parse(result.body.toString('utf8'))};
  };
  patientImageDecryption=createPatientImageDecryptor({...hospitalKeyConfig('B'),control,publicBaseUrl:'https://192.168.111.149:9443'});
}
const server = https.createServer({ cert: readFileSync(process.env.CAPSTONE_B_TLS_CERT_FILE), key: readFileSync(process.env.CAPSTONE_B_TLS_KEY_FILE), minVersion: "TLSv1.2" }, createCapstoneBPortal({ root: "/app/public", ca, encryptionRequired, imageDecryption,patientSelfViewEnabled,patientImageDecryption, diagnosticFactory: createRuntimeDiagnosticFactory(process.env) }));
server.headersTimeout = 10000;
server.requestTimeout = 15000;
server.setTimeout(encryptionRequired ? 35000 : 20000, socket => socket.destroy());
server.listen(8443, "0.0.0.0");
