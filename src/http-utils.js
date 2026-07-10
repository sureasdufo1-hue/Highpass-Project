import { readFile } from "node:fs/promises";
import path from "node:path";

export async function readJson(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  if (chunks.length === 0) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

export function sendJson(response, statusCode, body) {
  response.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
  response.end(JSON.stringify(body, null, 2));
}

export function sendError(response, statusCode, message, details = undefined) {
  sendJson(response, statusCode, { error: message, details });
}

export function getBearerToken(request) {
  const header = request.headers.authorization ?? "";
  const [scheme, token] = header.split(" ");
  return scheme?.toLowerCase() === "bearer" ? token : null;
}

export async function serveStatic(response, pathname) {
  const filePath = pathname === "/" ? "public/index.html" : path.join("public", pathname);
  const safePath = path.normalize(filePath);
  if (!safePath.startsWith("public")) {
    sendError(response, 403, "Forbidden");
    return;
  }

  try {
    const body = await readFile(safePath);
    response.writeHead(200, {
      "content-type": contentTypeFor(safePath),
      "cache-control": "no-store",
    });
    response.end(body);
  } catch {
    sendError(response, 404, "Not found");
  }
}

function contentTypeFor(filePath) {
  const extension = path.extname(filePath);
  const types = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
  };
  return types[extension] ?? "application/octet-stream";
}
