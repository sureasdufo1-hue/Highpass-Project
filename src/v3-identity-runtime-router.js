import { randomUUID } from 'node:crypto';
import { createV3MappingReadHandler } from './v3-mapping-read-handler.js';
import { createV3MappingWriteHandler } from './v3-mapping-write-handler.js';
import { sendProblem } from './http-utils.js';
import {createV3ExchangeHttpHandler} from './v3-exchange-http-handler.js';

const prefix = '/api/v3/patient-mappings';
/** Explicit host composition only. No listener, schema migration, identity
 * issuance or legacy-server activation. TLS/ingress activation is a separate gate. */
export function createV3IdentityRuntimeRouter({ mode, registry, readService, writeService, bodyDeadlineMs = 5000,networkAuthority,preauthObserver,sessionCreateService,sessionReadService } = {}) {
  if (mode !== 'CAPSTONE_SYNTHETIC_ONLY') throw new Error('V3_IDENTITY_RUNTIME_OPT_IN_REQUIRED');
  const read = createV3MappingReadHandler({ registry, service: readService,networkAuthority,preauthObserver });
  const write = createV3MappingWriteHandler({ registry, service: writeService, bodyDeadlineMs,networkAuthority,preauthObserver });
  let session;
  if(sessionCreateService!==undefined||sessionReadService!==undefined){
    if(sessionCreateService?.requireNetworkAudit!==true||sessionReadService?.requireNetworkAudit!==true)
      throw Error('V3_SESSION_STRICT_SERVICES_REQUIRED');
    session=createV3ExchangeHttpHandler({registry,createService:sessionCreateService,readService:sessionReadService,
      bodyDeadlineMs,networkAuthority,preauthObserver});
  }
  let disposed = false;
  function reject(request, response, status, code) {
    if (response.destroyed || response.writableEnded) return;
    response.setHeader('connection', 'close');
    response.once('finish', () => request.destroy());
    sendProblem(response, { type: 'about:blank', title: 'Request could not be completed', status, code, traceId: randomUUID() });
  }
  return Object.freeze({
    async handle(request, response) {
      const raw = request.url;
      if(session&&typeof raw==='string'&&(raw==='/api/v3/exchange-sessions'||raw.startsWith('/api/v3/exchange-sessions/')||raw.startsWith('/api/v3/exchange-sessions?'))){
        if(disposed){reject(request,response,503,'V3_IDENTITY_RUNTIME_UNAVAILABLE');return true;}
        if(raw.length>2048||/[%\\\u0000-\u0020\u007f]/u.test(raw)||raw.includes('#')){
          reject(request,response,422,'V3_SESSION_ROUTE_INVALID');return true;
        }
        await session(request,response);return true;
      }
      // Exact namespace boundary; do not swallow legacy routes or other v3 domains.
      if (typeof raw !== 'string' || !(raw === prefix || raw.startsWith(prefix + '/') || raw.startsWith(prefix + '?'))) return false;
      if (disposed) { reject(request, response, 503, 'V3_IDENTITY_RUNTIME_UNAVAILABLE'); return true; }
      // Reject decoded aliases and normalization before choosing any handler.
      if (raw.length > 2048 || /[%\\\u0000-\u0020\u007f]/u.test(raw) || raw.includes('#')) {
        reject(request, response, 422, 'V3_IDENTITY_ROUTE_INVALID'); return true;
      }
      const pathname = raw.split('?')[0];
      const segments = pathname.slice(prefix.length).split('/').slice(1);
      if (segments.some(value => value === '.' || value === '..' || value === '')) {
        reject(request, response, 404, 'V3_ROUTE_NOT_FOUND'); return true;
      }
      const sensitive = new Set(['authorization', 'x-trace-id', 'idempotency-key', 'x-audit-session-id', 'content-type', 'content-encoding', 'content-length']);
      const seen = new Set();
      for (let index = 0; index < (request.rawHeaders?.length ?? 0); index += 2) {
        const name = request.rawHeaders[index].toLowerCase();
        if (sensitive.has(name) && seen.has(name)) { reject(request, response, 422, 'V3_DUPLICATE_HEADER'); return true; }
        seen.add(name);
      }
      if (pathname === prefix + '/reconcile' || segments.length === 2 && segments[1] === 'reviews') await write(request, response);
      else if (segments.length === 1) await read(request, response);
      else reject(request, response, 404, 'V3_ROUTE_NOT_FOUND');
      return true;
    },
    dispose() { disposed = true; },
  });
}
