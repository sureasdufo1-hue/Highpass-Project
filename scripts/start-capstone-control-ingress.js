import { readFileSync } from "node:fs";
import https from "node:https";
import { createControlIngress } from "../src/capstone-control-ingress.js";

const secret = readFileSync(process.env.HIPASS_INGRESS_SECRET_FILE, "utf8");
if (/[\r\n\0]/.test(secret) || secret.length > 256) throw new Error("INVALID_INGRESS_SECRET_FILE");
const server = https.createServer({
  cert: readFileSync(process.env.EDGE_TLS_CERT_FILE),
  key: readFileSync(process.env.EDGE_TLS_KEY_FILE),
  minVersion: "TLSv1.2",
}, createControlIngress({ origin: "http://control:3000", secret }));
server.headersTimeout = 10000;
server.requestTimeout = 50000;
server.setTimeout(50000, socket => socket.destroy());
server.listen(8443, "0.0.0.0");
