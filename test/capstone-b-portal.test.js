import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import path from "node:path";
import { readFileSync } from "node:fs";
import { createCapstoneBPortal } from "../src/capstone-b-portal.js";

async function start(t, transport, configuration = {}) {
  const server = http.createServer(createCapstoneBPortal({ root: path.resolve("public"), ca: Buffer.from("test-ca"), transport, ...configuration }));
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }));
  const origin = `http://127.0.0.1:${server.address().port}`;
  return (pathname, options) => fetch(origin + pathname, { ...options, signal: AbortSignal.timeout(3000) });
}

test('patient B metadata is default-off, forwards only to A and never borrows doctor pixel decryption',async t=>{
  const route='/patient-dicomweb/studies/1.2/series/1.2.3/instances',calls=[];
  const disabled=await start(t,async()=>{throw new Error('unexpected');});
  assert.equal((await disabled(route)).status,503);
  const enabled=await start(t,async(...args)=>{calls.push(args);return {status:200,contentType:'application/dicom+json',body:Buffer.from('[]')};},{patientSelfViewEnabled:true});
  assert.equal((await enabled(route,{headers:{authorization:'DPoP synthetic-token',dpop:'synthetic-proof','x-hipass-service-token':'spoof'}})).status,200);
  assert.equal(calls[0][0],'https://10.90.88.2:9443');assert.equal(calls[0][2].headers['x-hipass-service-token'],undefined);
  assert.equal((await enabled(route+'/1.2.3.4/rendered')).status,503);
  assert.equal((await enabled(route+'/1.2.3.4/download')).status,400);assert.equal(calls.length,1);
});

test('patient B pixel branch requires its own adapter, binds original token and clears transient bytes',async t=>{
  const path='/patient-dicomweb/studies/1.2/series/1.2.3/instances/1.2.3.4/rendered';
  let output,deny=false;
  const get=await start(t,async()=>({status:200,contentType:'application/vnd.highpass.encrypted-dicom+json',body:Buffer.from('encrypted contract fixture')}),{
    patientSelfViewEnabled:true,patientImageDecryption:{openPatient:async(result,requestPath,{token})=>{
      assert.equal(requestPath,path);assert.equal(token,'synthetic-original-token');if(deny)throw new Error('PATIENT_GRANT_INACTIVE');
      output=Buffer.from('synthetic browser bytes');return {contentType:'image/png',body:output};
    }}
  });
  const response=await get(path,{headers:{authorization:'DPoP synthetic-original-token',dpop:'proof'}});
  assert.equal(response.status,200);assert.equal(await response.text(),'synthetic browser bytes');assert.ok(output.every(v=>v===0));
  deny=true;const rejected=await get(path,{headers:{authorization:'DPoP synthetic-original-token',dpop:'proof'}});
  assert.equal(rejected.status,503);assert.ok(!(await rejected.text()).includes('synthetic browser bytes'));
});
test("B portal activates the existing UI login and denies secret query, internal service routes and clinical static files", async t => {
  const get = await start(t, () => { throw new Error("Unexpected upstream"); });
  const page = await get("/hipass/");
  assert.equal(page.status, 200);
  assert.match(await page.text(), /data-capstone="1"/u);
  assert.match(page.headers.get("content-security-policy"), /connect-src 'self'/u);
  for (const pathname of ["/gateway/data-plane/authorize", "/assets/clinical/sample.dcm", "/api/health?token=synthetic-value"]) assert.ok([400, 404].includes((await get(pathname)).status));
});
test("B mobile entry and exact PWA manifest preserve JWT activation without exposing arbitrary JSON", async t => {
  const get = await start(t, () => { throw new Error("Unexpected upstream"); });
  for (const pathname of ["/mobile", "/mobile/", "/mobile/index.html"]) {
    const page = await get(pathname);
    assert.equal(page.status, 200);
    const html = await page.text();
    assert.match(html, /data-capstone="1"/);
    assert.match(html, /src="\/mobile\/app.js" type="module"/);
  }
  const manifest = await get("/mobile/manifest.json");
  assert.equal(manifest.status, 200);
  assert.match(manifest.headers.get('content-type'), /application\/manifest\+json/);
  assert.equal((await manifest.json()).start_url, '/mobile/');
  for (const pathname of ["/mobile/secrets.json", "/config.json", "/mobile/manifest.json?key=synthetic-value"]) assert.ok([400, 404].includes((await get(pathname)).status));
});
test("B proxy preserves user proof but strips spoofed identity/service headers and sends only curated private upstream", async t => {
  const seen = [];
  const get = await start(t, async (...args) => { seen.push(args); return { status: 200, contentType: "application/json", body: Buffer.from("[]") }; });
  const response = await get("/dicomweb/studies", { headers: { authorization: "DPoP synthetic-token", dpop: "synthetic-proof", "x-hipass-role": "PLATFORM_ADMIN", "x-hipass-service-token": "spoofed", "x-forwarded-for": "spoofed" } });
  assert.equal(response.status, 200);
  assert.equal(seen[0][0], "https://10.90.88.2:9443");
  assert.equal(seen[0][2].headers.authorization, "DPoP synthetic-token");
  for (const key of ["x-hipass-role", "x-hipass-service-token", "x-forwarded-for"]) assert.equal(seen[0][2].headers[key], undefined);
  assert.equal((await get("/api/consents", { method: "POST", headers: { "content-type": "application/json", origin: "https://evil.invalid" }, body: "{}" })).status, 403);
  assert.equal(seen.length, 1);
});
test("Viewer cannot substitute preview images after denial or a transport error", () => {
  const app = readFileSync("public/app.js", "utf8");
  const block = app.slice(app.indexOf("// 2. Fetch rendered slice"), app.indexOf("function stepSlice"));
  assert.doesNotMatch(block, /showSeriesImage\(resolvePreview/u);
  assert.match(block, /hideSeriesImage\(\)/u);
  assert.match(block, /clearSliceBlobCache\(\)/u);
});

test("required B crypto never serves an undecrypted image and clears transient output after response", async t => {
  const route = "/dicomweb/studies/1.2/series/1.2.3/instances/1.2.3.4/rendered";
  const original = Buffer.from("synthetic browser output only");
  let plaintext, refuse = false;
  const get = await start(t, async () => ({ status: 200, contentType: "application/vnd.highpass.encrypted-dicom+json", body: Buffer.from("encrypted fixture") }), {
    encryptionRequired: true, imageDecryption: { async open() {
      if (refuse) throw new Error("CONSENT_REVOKED");
      plaintext = Buffer.from(original);
      return { contentType: "image/png", body: plaintext };
    } } });
  const response = await get(route);
  assert.equal(response.status, 200);
  assert.deepEqual(Buffer.from(await response.arrayBuffer()), original);
  assert.ok(plaintext.every(byte => byte === 0));
  refuse = true;
  const denied = await get(route);
  assert.equal(denied.status, 503);
  assert.ok(!(await denied.text()).includes(original.toString()));
  assert.throws(() => createCapstoneBPortal({ root: "public", encryptionRequired: true }), /DECRYPTION_REQUIRED/);
});
