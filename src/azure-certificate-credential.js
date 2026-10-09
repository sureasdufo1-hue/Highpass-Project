import https from "node:https";
import { X509Certificate, createPrivateKey, createPublicKey, createHash, randomUUID, sign } from "node:crypto";

export class AzureCertificateCredentialError extends Error {
  constructor(code) { super(code); this.code = code; this.name = "AzureCertificateCredentialError"; }
}

/** Hospital Data Plane only. No user CLI cache, client password or log output. */
export function createAzureCertificateCredential({ tenantId, clientId, certificate, privateKey, transport = entraTokenRequest, timeoutMs = 10000 } = {}) {
  const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
  if (!uuid.test(tenantId ?? "") || !uuid.test(clientId ?? "") || typeof transport !== "function" || !Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 30000) throw new AzureCertificateCredentialError("ENTRA_CONFIGURATION_INVALID");
  let cert, key;
  try {
    cert = new X509Certificate(certificate);
    key = createPrivateKey(privateKey);
    if (key.asymmetricKeyType !== "rsa" || (key.asymmetricKeyDetails?.modulusLength ?? 0) < 2048 || !createPublicKey(key).export({ type:"spki", format:"der" }).equals(cert.publicKey.export({ type:"spki", format:"der" }))) throw new Error();
  } catch { throw new AzureCertificateCredentialError("ENTRA_CERTIFICATE_KEY_INVALID"); }
  const endpoint = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;
  return async ({ resource, signal } = {}) => {
    if (resource !== "https://vault.azure.net") throw new AzureCertificateCredentialError("ENTRA_RESOURCE_NOT_ALLOWED");
    if (signal?.aborted) throw new AzureCertificateCredentialError("ENTRA_TIMEOUT");
    const now = Date.now();
    if (now < Date.parse(cert.validFrom) || now >= Date.parse(cert.validTo)) throw new AzureCertificateCredentialError("ENTRA_CERTIFICATE_EXPIRED");
    const numeric = Math.floor(now / 1000);
    const header = { alg:"RS256", typ:"JWT", x5t:createHash("sha1").update(cert.raw).digest("base64url") };
    const claims = { aud:endpoint, iss:clientId, sub:clientId, iat:numeric, nbf:numeric-5, exp:numeric+60, jti:randomUUID() };
    const input = [header, claims].map(value=>Buffer.from(JSON.stringify(value)).toString("base64url")).join(".");
    const assertion = `${input}.${sign("RSA-SHA256", Buffer.from(input), key).toString("base64url")}`;
    const body = Buffer.from(new URLSearchParams({ client_id:clientId, scope:"https://vault.azure.net/.default", grant_type:"client_credentials", client_assertion_type:"urn:ietf:params:oauth:client-assertion-type:jwt-bearer", client_assertion:assertion }).toString());
    const controller = new AbortController();
    const abort = () => controller.abort();
    signal?.addEventListener("abort", abort, {once:true});
    let timer;
    try {
      const response = await Promise.race([
        transport({ url:endpoint, body, signal:controller.signal }),
        new Promise((_,reject)=>{ timer=setTimeout(()=>{controller.abort(); reject(new AzureCertificateCredentialError("ENTRA_TIMEOUT"));},timeoutMs); }),
        new Promise((_,reject)=>{ controller.signal.addEventListener("abort",()=>reject(new AzureCertificateCredentialError("ENTRA_TIMEOUT")),{once:true}); })
      ]);
      if (controller.signal.aborted || signal?.aborted) throw new AzureCertificateCredentialError("ENTRA_TIMEOUT");
      if (response?.token_type !== "Bearer" || typeof response.access_token !== "string" || !/^[A-Za-z0-9._~-]{1,16384}$/.test(response.access_token) || !Number.isInteger(response.expires_in) || response.expires_in <= 0 || response.expires_in > 86400) throw new AzureCertificateCredentialError("ENTRA_RESPONSE_INVALID");
      return response.access_token;
    } catch(error) { throw error instanceof AzureCertificateCredentialError ? error : new AzureCertificateCredentialError("ENTRA_AUTH_FAILED"); }
    finally { clearTimeout(timer); signal?.removeEventListener("abort",abort); controller.abort(); body.fill(0); }
  };
}

export function entraTokenRequest({ url, body, signal }) {
  return new Promise((resolve,reject)=>{
    if (!/^https:\/\/login\.microsoftonline\.com\/[a-f0-9-]{36}\/oauth2\/v2\.0\/token$/.test(url ?? "") || !Buffer.isBuffer(body)) { reject(new AzureCertificateCredentialError("ENTRA_DESTINATION_INVALID")); return; }
    const request = https.request(url,{ method:"POST", minVersion:"TLSv1.2", rejectUnauthorized:true, signal, headers:{"content-type":"application/x-www-form-urlencoded","content-length":body.length}}, response=>{
      let size=0;
      const chunks=[];
      response.on("data",chunk=>{size+=chunk.length; if(size>16384) request.destroy(new AzureCertificateCredentialError("ENTRA_RESPONSE_LIMIT")); else chunks.push(chunk);});
      response.on("error",()=>reject(new AzureCertificateCredentialError("ENTRA_RESPONSE_FAILED")));
      response.on("end",()=>{
        const payload=Buffer.concat(chunks);
        try { if(response.statusCode!==200) throw new AzureCertificateCredentialError("ENTRA_AUTH_DENIED"); resolve(JSON.parse(payload.toString("utf8"))); }
        catch(error) { reject(error instanceof AzureCertificateCredentialError ? error : new AzureCertificateCredentialError("ENTRA_RESPONSE_INVALID")); }
        finally { payload.fill(0); for(const chunk of chunks) chunk.fill(0); }
      });
      response.on("close",()=>{for(const chunk of chunks) chunk.fill(0);});
    });
    const deadline=setTimeout(()=>request.destroy(new AzureCertificateCredentialError("ENTRA_TIMEOUT")),10000);
    request.on("close",()=>clearTimeout(deadline));
    request.on("error",error=>reject(error instanceof AzureCertificateCredentialError ? error : new AzureCertificateCredentialError(signal?.aborted ? "ENTRA_TIMEOUT" : ["ENOTFOUND","EAI_AGAIN"].includes(error.code) ? "ENTRA_DNS_FAILED" : /CERT|TLS|SSL/.test(error.code ?? "") ? "ENTRA_TLS_FAILED" : "ENTRA_CONNECTION_FAILED")));
    request.end(body);
  });
}
