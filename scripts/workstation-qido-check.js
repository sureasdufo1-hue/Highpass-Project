// Synthetic metadata verification only; do not log patient tags or response bodies.
import https from "node:https";
import { readFileSync } from "node:fs";

const expected = new Set([
  "1.2.410.100.1.20260620.001",
  "1.2.410.100.1.20260518.002",
  "1.2.826.0.1.3680043.10.5432.20260908.1001.1",
]);
// Explicit presentation fixture profile, not permission to accept any extras.
if (process.env.HIPASS_EXPECT_PHANTOM === '1') {
  expected.add('1.2.826.0.1.3680043.10.5432.20261009.1');
  expected.add('1.2.826.0.1.3680043.10.5432.20261009.2');
}
const request = https.get({
  hostname: process.env.MTLS_HOST,
  servername: process.env.MTLS_SERVERNAME,
  port: 8443,
  path: "/dicom-web/studies",
  rejectUnauthorized: true,
  ca: readFileSync(process.env.MTLS_CA_FILE),
  cert: readFileSync(process.env.MTLS_CERT_FILE),
  key: readFileSync(process.env.MTLS_KEY_FILE),
}, (response) => {
  let body = "";
  response.setEncoding("utf8");
  response.on("data", (chunk) => {
    body += chunk;
    if (body.length > 1048576) request.destroy(Object.assign(new Error("response limit"), { code: "RESPONSE_LIMIT" }));
  });
  response.on("error", fail);
  response.on("end", () => {
    try {
      const rows = JSON.parse(body);
      const actual = new Set(rows.map((item) => item["0020000D"]?.Value?.[0]));
      const passed = response.statusCode === 200 && actual.size === expected.size && [...expected].every((uid) => actual.has(uid));
      console.log(JSON.stringify({ status: passed ? "PASS" : "FAIL", statusCode: response.statusCode, syntheticStudyCount: actual.size, expectedStudyCount: expected.size }));
      process.exit(passed ? 0 : 1);
    } catch {
      console.error(JSON.stringify({ status: "FAIL", error: "INVALID_QIDO_RESPONSE", statusCode: response.statusCode, contentType: response.headers["content-type"] ?? null }));
      process.exit(1);
    }
  });
});
const deadline = setTimeout(() => request.destroy(Object.assign(new Error("deadline"), { code: "ETIMEDOUT" })), 5000);
request.setTimeout(4000, () => request.destroy(Object.assign(new Error("timeout"), { code: "ETIMEDOUT" })));
request.on("close", () => clearTimeout(deadline));
request.on("error", fail);
function fail(error) {
  console.error(JSON.stringify({ status: "FAIL", error: error.code ?? "REQUEST_FAILED" }));
  process.exit(1);
}
