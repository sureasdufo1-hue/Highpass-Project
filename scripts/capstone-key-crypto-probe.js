// Explicit operator-controlled crypto/PACS fixture. NOT live consent key release.
import { readFileSync, writeFileSync } from "node:fs";
import { randomBytes, randomUUID, createHash } from "node:crypto";
import { createAzureCertificateCredential } from "/probe/azure-certificate-credential.mjs";
import { AzureKeyVaultDataPlane } from "/app/src/azure-key-vault-data-plane.js";
import { buildEncryptedImagingPackage, decryptAndVerifyImagingPackage } from "/probe/mobile-package-crypto.mjs";
import { boundedHttps } from "/app/src/data-plane-gateway.js";
import { extractSingleDicomInstance } from "/probe/dicomweb-single-instance.mjs";

const identity = JSON.parse(readFileSync("/run/identity/identity.json", "utf8"));
const registry = JSON.parse(readFileSync("/probe/registry.json", "utf8"));
const tokenProvider = createAzureCertificateCredential({ tenantId:identity.tenantId, clientId:identity.clientId, certificate:readFileSync("/run/identity/identity.crt"), privateKey:readFileSync("/run/identity/identity.key") });
const checks=[];
const sourceDigests=Object.fromEntries(["probe.mjs","azure-certificate-credential.mjs","dicomweb-single-instance.mjs","mobile-package-crypto.mjs","registry.json"].map(name=>[name,createHash("sha256").update(readFileSync("/probe/"+name)).digest("hex")]));
const file="/run/output/package.json";
const hash=buffer=>createHash("sha256").update(buffer).digest("base64url");
const serialise=chunk=>({ ...chunk, ciphertext:chunk.ciphertext.toString("base64url"), nonce:chunk.nonce.toString("base64url"), tag:chunk.tag.toString("base64url") });
const restore=chunk=>({ ...chunk, ciphertext:Buffer.from(chunk.ciphertext,"base64url"), nonce:Buffer.from(chunk.nonce,"base64url"), tag:Buffer.from(chunk.tag,"base64url") });
const check=(test,pass,extra={})=>checks.push({test,status:pass?"PASS":"FAIL",...extra});
try {
  if(identity.role==="A") {
    const uid="1.2.410.100.1.20260620.001";
    const series=uid+".1";
    const instance=series+".1";
    const pacs=await boundedHttps("https://orthanc-mtls:8443",`/dicom-web/studies/${uid}/series/${series}/instances/${instance}`,{ tls:{ca:readFileSync("/run/pacs/ca.crt"),cert:readFileSync("/run/pacs/gateway-client.crt"),key:readFileSync("/run/pacs/gateway-client.key"),servername:"hospital-a-orthanc-mtls"},headers:{accept:"multipart/related; type=application/dicom"},timeoutMs:5000,maxBytes:1048576 });
    if(pacs.status!==200) throw new Error("SELECTED_DICOM_NOT_VERIFIED");
    const multipart=pacs.body;
    pacs.body=extractSingleDicomInstance(pacs);
    multipart.fill(0);
    // Strict selected-instance WADO response. Never export a multipart wrapper as DICOM.
    const valid=pacs.status===200&&pacs.body.length>=132&&pacs.body.subarray(128,132).toString()==="DICM";
    check("A_ACTUAL_SYNTHETIC_PACS_MTLS_DICOM",valid,{bytes:pacs.body.length,http:pacs.status,contentType:pacs.contentType});
    if(!valid) throw new Error("SELECTED_DICOM_NOT_VERIFIED");
    const packageId="pkg_"+randomUUID().replaceAll("-","");
    const client=new AzureKeyVaultDataPlane({keyId:registry.keyId,tokenProvider,authorizeOperation:async binding=>binding.packageId===packageId});
    const dek=randomBytes(32);
    try {
      const encrypted=buildEncryptedImagingPackage({ packageId,transferId:"trf_"+randomUUID().replaceAll("-",""),consentId:"consent_operator_crypto_fixture_only",patientRef:"pat_"+randomUUID().replaceAll("-",""),sourceInstitution:"HOSP-A",destinationInstitution:"HOSP-B",purpose:"TREATMENT",scope:{studyRefs:[uid],actions:["VIEW"]},objects:[{studyRef:uid,seriesRef:series,instanceRef:instance,data:pacs.body}],keyEnvelopeRefs:["kenv_"+randomUUID().replaceAll("-","")],dek });
      encrypted.dek.fill(0); // Builder's internal key copy must not leave A.
      const wrapped=await client.wrapDek({packageId,dek});
      check("A_REAL_RSA_OAEP_256_WRAP",wrapped.keyId===registry.keyId&&wrapped.wrappedKey.length>100);
      let denied=false;
      try { await client.consumeUnwrappedDek({packageId,envelope:wrapped,consume:()=>{throw new Error("A_UNEXPECTED_UNWRAP");}}); }
      catch(error) {denied=error.code==="KV_AUTH_DENIED";}
      check("A_EFFECTIVE_UNWRAP_PERMISSION_DENY",denied);
      const payload={ environment:"OPERATOR_SYNTHETIC_CRYPTO_FIXTURE_ONLY",packageId,wrapped,envelope:encrypted.envelope,chunks:encrypted.chunks.map(serialise),plaintextHash:hash(pacs.body),plaintextBytes:pacs.body.length };
      writeFileSync(file,JSON.stringify(payload),{mode:0o600,flag:"wx"});
      check("A_CIPHERTEXT_ONLY_EXPORT",!JSON.stringify(payload).includes(dek.toString("base64url")));
    } finally {dek.fill(0);pacs.body.fill(0);}
  } else if(identity.role==="B") {
    const fixture=JSON.parse(readFileSync(file,"utf8"));
    if(fixture.environment!=="OPERATOR_SYNTHETIC_CRYPTO_FIXTURE_ONLY"||fixture.wrapped.keyId!==registry.keyId) throw new Error("FIXTURE_BINDING_INVALID");
    const client=new AzureKeyVaultDataPlane({keyId:registry.keyId,tokenProvider,authorizeOperation:async binding=>binding.packageId===fixture.packageId&&(!binding.wrappedKeyHash||binding.wrappedKeyHash===hash(Buffer.from(fixture.wrapped.wrappedKey,"base64url")))});
    let transient; let decoded=false;
    await client.consumeUnwrappedDek({packageId:fixture.packageId,envelope:fixture.wrapped,consume:dek=>{
      transient=dek;
      const verified=decryptAndVerifyImagingPackage({envelope:fixture.envelope,chunks:fixture.chunks.map(restore),dek});
      const dicom=Buffer.concat(verified.plaintextChunks);
      try {decoded=dicom.length===fixture.plaintextBytes&&hash(dicom)===fixture.plaintextHash&&dicom.subarray(128,132).toString()==="DICM";}
      finally {dicom.fill(0);for(const chunk of verified.plaintextChunks) chunk.fill(0);}
    }});
    check("B_REAL_UNWRAP_AES_GCM_DICOM_INTEGRITY",decoded,{syntheticDicomBytes:fixture.plaintextBytes});
    check("B_TRANSIENT_DEK_CLEARED",transient.every(byte=>byte===0));
    const random=randomBytes(32); let denied=false;
    try {await client.wrapDek({packageId:fixture.packageId,dek:random});}
    catch(error) {denied=error.code==="KV_AUTH_DENIED";}
    finally {random.fill(0);}
    check("B_EFFECTIVE_WRAP_PERMISSION_DENY",denied);
    let tampered=false;
    try {await client.consumeUnwrappedDek({packageId:fixture.packageId,envelope:fixture.wrapped,consume:dek=>{
      const chunks=fixture.chunks.map(restore);chunks[0].tag[0]^=1;
      try {decryptAndVerifyImagingPackage({envelope:fixture.envelope,chunks,dek});}
      catch(error) {tampered=error.code==="CRYPTO_AUTH_FAILED";throw error;}
    }});} catch {}
    check("B_TAMPERED_GCM_TAG_DENY",tampered);
  } else throw new Error("VM_ROLE_INVALID");
} catch(error) {
  checks.push({test:"ACTUAL_KEY_CRYPTO_STAGE",status:"NOT VERIFIED",reason:error.code??(["SELECTED_DICOM_NOT_VERIFIED","FIXTURE_BINDING_INVALID","VM_ROLE_INVALID"].includes(error.message)?error.message:"CRYPTO_TRANSPORT_OR_RESPONSE_FAILED")});
}
const result={scope:"REAL_KEY_VAULT_AND_AES_GCM_SYNTHETIC_DICOM_OPERATOR_FIXTURE_ONLY",review:"DRAFT / UNASSIGNED",sourceDigests,checks,status:checks.length&&checks.every(item=>item.status==="PASS")?"PASS":"NOT VERIFIED",liveConsentKeyRelease:"NOT VERIFIED",encryptedViewer:"NOT VERIFIED"};
console.log(JSON.stringify(result));
process.exitCode=result.status==="PASS"?0:1;
