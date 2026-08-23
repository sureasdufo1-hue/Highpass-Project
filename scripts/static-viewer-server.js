#!/usr/bin/env node
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const staticRoot = path.resolve(process.env.VIEWER_STATIC_ROOT ?? path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "viewer"));
const port = Number(process.env.VIEWER_PORT ?? 8080);

const contentTypes = new Map([
  [".html", "text/html; charset=utf-8"],
  [".js", "application/javascript; charset=utf-8"],
  [".mjs", "application/javascript; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".png", "image/png"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".svg", "image/svg+xml"],
  [".ico", "image/x-icon"],
  [".wasm", "application/wasm"],
  [".map", "application/json; charset=utf-8"],
]);

createServer(async (request, response) => {
  try {
    response.setHeader("X-Content-Type-Options", "nosniff");
    response.setHeader("Referrer-Policy", "no-referrer");

    const url = new URL(request.url ?? "/", "http://127.0.0.1");
    const decodedPath = decodeURIComponent(url.pathname);
    const candidate = path.resolve(staticRoot, `.${decodedPath}`);
    if (!candidate.startsWith(`${staticRoot}${path.sep}`) && candidate !== staticRoot) {
      return sendText(response, 403, "Forbidden");
    }

    const filePath = await resolveFile(candidate);
    const fileStat = await stat(filePath);
    if (!fileStat.isFile()) return sendText(response, 404, "Not Found");

    response.writeHead(200, {
      "Content-Type": contentTypes.get(path.extname(filePath).toLowerCase()) ?? "application/octet-stream",
      "Content-Length": fileStat.size,
      "Cache-Control": filePath.endsWith("index.html") || filePath.endsWith("app-config.js") ? "no-store" : "public, max-age=300",
    });
    createReadStream(filePath).pipe(response);
  } catch {
    const fallback = path.join(staticRoot, "index.html");
    try {
      const fileStat = await stat(fallback);
      response.writeHead(200, {
        "Content-Type": "text/html; charset=utf-8",
        "Content-Length": fileStat.size,
        "Cache-Control": "no-store",
      });
      createReadStream(fallback).pipe(response);
    } catch {
      sendText(response, 404, "Not Found");
    }
  }
}).listen(port, "0.0.0.0");

async function resolveFile(candidate) {
  try {
    const fileStat = await stat(candidate);
    if (fileStat.isDirectory()) return path.join(candidate, "index.html");
    return candidate;
  } catch {
    return path.join(staticRoot, "index.html");
  }
}

function sendText(response, statusCode, body) {
  response.writeHead(statusCode, { "Content-Type": "text/plain; charset=utf-8" });
  response.end(body);
}
