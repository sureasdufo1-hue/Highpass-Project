import https from "node:https";
import { readFileSync } from "node:fs";

const options = {
  hostname: process.env.MTLS_HOST ?? "hospital-a-orthanc-mtls",
  port: Number(process.env.MTLS_PORT ?? 8443),
  path: process.env.MTLS_PATH ?? "/system",
  method: "GET",
  servername: process.env.MTLS_SERVERNAME ?? "hospital-a-orthanc-mtls",
  ca: readFileSync(requiredEnv("MTLS_CA_FILE")),
  cert: process.env.MTLS_CERT_FILE ? readFileSync(process.env.MTLS_CERT_FILE) : undefined,
  key: process.env.MTLS_KEY_FILE ? readFileSync(process.env.MTLS_KEY_FILE) : undefined,
  rejectUnauthorized: true,
};
let connection = {};

const request = https.request(options, (response) => {
  response.resume();
  response.on("end", () => {
    console.log(JSON.stringify({ statusCode: response.statusCode }));
    process.exit(response.statusCode === 200 ? 0 : 2);
  });
});
const deadline = setTimeout(() => {
  request.destroy(Object.assign(new Error("mTLS request deadline exceeded"), { code: "ETIMEDOUT" }));
}, 5000);
request.setTimeout(4000, () => request.destroy(Object.assign(new Error("mTLS socket timeout"), { code: "ETIMEDOUT" })));
request.on("close", () => clearTimeout(deadline));
request.on("socket", (socket) => {
  socket.once("connect", () => { connection = { localAddress: socket.localAddress, localPort: socket.localPort }; });
});

request.on("error", (error) => {
  console.error(JSON.stringify({ error: error.code ?? error.message, ...connection }));
  process.exit(1);
});

request.end();

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}
