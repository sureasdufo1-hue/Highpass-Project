import { readFile } from "node:fs/promises";
import path from "node:path";

export class RequestBodyError extends Error {
  constructor(statusCode, code) {
    super(code);
    this.name = "RequestBodyError";
    this.statusCode = statusCode;
    this.code = code;
  }
}

export async function readJson(request, options = {}) {
  const maxBytes = options.maxBytes ?? 1024 * 1024;
  const chunks = [];
  let total = 0;
  for await (const chunk of request) {
    total += chunk.length;
    if (total > maxBytes) throw new RequestBodyError(413, "INPUT_TOO_LARGE");
    chunks.push(chunk);
  }
  if (chunks.length === 0) return {};
  try {
    const decoder = new TextDecoder("utf-8", { fatal: options.strictUtf8 === true });
    return JSON.parse(decoder.decode(Buffer.concat(chunks)));
  } catch {
    throw new RequestBodyError(422, "INVALID_CONTENT");
  }
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

export function sendProblem(response, problem) {
  response.writeHead(problem.status, {
    "content-type": "application/problem+json; charset=utf-8",
    "cache-control": "no-store",
  });
  response.end(JSON.stringify(problem, null, 2));
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
