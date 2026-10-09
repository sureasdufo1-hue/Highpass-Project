import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { X509Certificate, verify, generateKeyPairSync } from "node:crypto";
import { createAzureCertificateCredential, AzureCertificateCredentialError, entraTokenRequest } from "../src/azure-certificate-credential.js";

const directory=mkdtempSync(path.join(tmpdir(),"highpass-entra-test-"));
const openssl=process.platform==="win32" ? "C:/Program Files/Git/usr/bin/openssl.exe" : "openssl";
execFileSync(openssl,["req","-x509","-newkey","rsa:2048","-nodes","-days","1","-subj","/CN=synthetic-entra-unit-fixture","-keyout",path.join(directory,"identity.key"),"-out",path.join(directory,"identity.crt")],{timeout:10000,stdio:"ignore"});
const certificate=readFileSync(path.join(directory,"identity.crt"));
const privateKey=readFileSync(path.join(directory,"identity.key"));
rmSync(directory,{recursive:true});
const options={tenantId:"11111111-1111-1111-1111-111111111111",clientId:"22222222-2222-2222-2222-222222222222",certificate,privateKey};
const hasCode=code=>error=>error instanceof AzureCertificateCredentialError && error.code===code;

test("certificate client signs bounded unique Vault-only assertions and clears transmitted buffers",async()=>{
  const ids=[]; const buffers=[];
  const token=createAzureCertificateCredential({...options,transport:async({url,body})=>{
    buffers.push(body);
    const form=new URLSearchParams(body.toString());
    assert.equal(form.get("scope"),"https://vault.azure.net/.default");
    assert.equal(form.has("client_secret"),false);
    const pieces=form.get("client_assertion").split(".");
    const header=JSON.parse(Buffer.from(pieces[0],"base64url"));
    const claims=JSON.parse(Buffer.from(pieces[1],"base64url"));
    assert.equal(header.alg,"RS256"); assert.equal(claims.aud,url);
    assert.equal(claims.exp-claims.iat,60); ids.push(claims.jti);
    assert.ok(verify("RSA-SHA256",Buffer.from(pieces.slice(0,2).join(".")),new X509Certificate(certificate).publicKey,Buffer.from(pieces[2],"base64url")));
    return {token_type:"Bearer",access_token:"synthetic-token",expires_in:3600};
  }});
  assert.equal(await token({resource:"https://vault.azure.net"}),"synthetic-token");
  await token({resource:"https://vault.azure.net"}); assert.notEqual(ids[0],ids[1]);
  assert.ok(buffers.every(buffer=>buffer.every(byte=>byte===0)));
  await assert.rejects(token({resource:"https://management.azure.com"}),hasCode("ENTRA_RESOURCE_NOT_ALLOWED"));
});

test("certificate client rejects foreign keys, destinations and invalid token responses",async()=>{
  const other=generateKeyPairSync("rsa",{modulusLength:2048}).privateKey.export({type:"pkcs8",format:"pem"});
  assert.throws(()=>createAzureCertificateCredential({...options,privateKey:other}),hasCode("ENTRA_CERTIFICATE_KEY_INVALID"));
  assert.throws(()=>createAzureCertificateCredential({...options,tenantId:"https://evil.invalid"}),hasCode("ENTRA_CONFIGURATION_INVALID"));
  await assert.rejects(entraTokenRequest({url:"http://login.microsoftonline.com/",body:Buffer.alloc(0)}),hasCode("ENTRA_DESTINATION_INVALID"));
  const token=createAzureCertificateCredential({...options,transport:async()=>({token_type:"Bearer",access_token:"secret\nunsafe",expires_in:3600})});
  await assert.rejects(token({resource:"https://vault.azure.net"}),hasCode("ENTRA_RESPONSE_INVALID"));
});

test("certificate acquisition timeout and abort fail closed without sensitive provider errors",async()=>{
  const timeout=createAzureCertificateCredential({...options,timeoutMs:10,transport:async()=>new Promise(()=>{})});
  await assert.rejects(timeout({resource:"https://vault.azure.net"}),hasCode("ENTRA_TIMEOUT"));
  const denied=createAzureCertificateCredential({...options,transport:async()=>{throw new Error("sensitive diagnostic");}});
  await assert.rejects(denied({resource:"https://vault.azure.net"}),hasCode("ENTRA_AUTH_FAILED"));
  const controller=new AbortController(); controller.abort();
  await assert.rejects(denied({resource:"https://vault.azure.net",signal:controller.signal}),hasCode("ENTRA_TIMEOUT"));
});
