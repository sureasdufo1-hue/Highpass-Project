// Loopback-only static design preview. Never starts the application or accesses its DB.
import http from 'node:http';
import { readFile } from 'node:fs/promises';
const root = new URL('../public/mockups/highpass-refresh/', import.meta.url);
const routes = new Map([
  ['/', ['index.html', 'text/html; charset=utf-8']],
  ['/design.css', ['design.css', 'text/css; charset=utf-8']],
  ['/preview.js', ['preview.js', 'text/javascript; charset=utf-8']],
]);
const server = http.createServer(async (request, response) => {
  const asset = routes.get(request.url);
  if (request.method !== 'GET' || !asset) {
    response.writeHead(404).end('Not found');
    return;
  }
  try {
    const bytes = await readFile(new URL(asset[0], root));
    response.writeHead(200, {
      'content-type': asset[1], 'cache-control': 'no-store',
      'x-content-type-options': 'nosniff', 'referrer-policy': 'no-referrer',
      'content-security-policy': "default-src 'none'; style-src 'self'; script-src 'self'; img-src 'self'; connect-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
    }).end(bytes);
  } catch {
    response.writeHead(500).end('Preview asset unavailable');
  }
});
server.requestTimeout = 5000;
server.headersTimeout = 5000;
server.keepAliveTimeout = 1000;
server.on('error', error => { console.error(`PREVIEW_START_FAILED ${error.code ?? 'UNKNOWN'}`); process.exitCode = 1; });
server.listen(9457, '127.0.0.1', () => console.log('DESIGN_PREVIEW http://127.0.0.1:9457'));
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => { server.closeAllConnections(); server.close(); });
