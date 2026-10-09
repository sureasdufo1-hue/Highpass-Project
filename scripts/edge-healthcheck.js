import { readFileSync } from "node:fs";
import https from "node:https";

const request = https.get({
  hostname: "127.0.0.1",
  servername: "localhost",
  port: Number(process.env.EDGE_HTTPS_PORT ?? 8443),
  path: "/api/health",
  ca: readFileSync(process.env.EDGE_TLS_CA_FILE),
  timeout: 4000,
}, (response) => {
  response.resume();
  response.on("end", () => process.exit(response.statusCode === 200 ? 0 : 1));
});
request.on("timeout", () => request.destroy(new Error("HEALTH_TIMEOUT")));
request.on("error", () => process.exit(1));
setTimeout(() => process.exit(1), 4500).unref();
