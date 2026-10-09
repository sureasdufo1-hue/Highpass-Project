import { X509Certificate, randomUUID } from 'node:crypto';
import { TLSSocket } from 'node:tls';
import { ingressMeta } from './ingress.js';
import { createV3IdentityRuntimeRouter } from './v3-identity-runtime-router.js';
import { sendProblem } from './http-utils.js';
import {createIdentityNetworkAuthority} from './v3-identity-network-context.js';
import {assertPreauthEdgeObserver} from './v3-preauth-security-events.js';
export const IDENTITY_PROXY_SAN = 'URI:spiffe://highpass.local/dev/identity-edge-proxy';
const boundHeaders = new Set(['authorization', 'x-forwarded-for', 'x-forwarded-proto', 'x-hipass-ingress-time', 'x-hipass-ingress-signature', 'idempotency-key', 'x-audit-session-id', 'x-trace-id', 'content-type', 'content-length', 'content-encoding']);

/** Transport admission only. Registry/RLS/audit remain the existing services;
 * no live listener, DPoP assurance, MFA claim or runtime database activation. */
export function createV3IdentityCapstoneEdge({ mode, ingressSecret, preauthObserver, ...dependencies } = {}) {
  if (mode !== 'CAPSTONE_SYNTHETIC_ONLY' || !Buffer.isBuffer(ingressSecret) || ingressSecret.length !== 32) throw new Error('V3_IDENTITY_EDGE_CONFIGURATION_REQUIRED');
  if(dependencies.readService?.requireNetworkAudit!==true||dependencies.writeService?.requireNetworkAudit!==true)throw Error('V3_IDENTITY_STRICT_SERVICES_REQUIRED');
  if(preauthObserver!==undefined)assertPreauthEdgeObserver(preauthObserver);
  const authority=createIdentityNetworkAuthority({mode,ingressSecret});
  let router;try{router=createV3IdentityRuntimeRouter({...dependencies,mode,networkAuthority:authority,preauthObserver});}catch(error){authority.dispose();throw error;}
  let secret = Buffer.from(ingressSecret);
  const deny = (request, response) => {
    if (response.destroyed || response.writableEnded) return;
    response.setHeader('connection', 'close'); response.once('finish', () => request.destroy());
    sendProblem(response, { type: 'about:blank', title: 'Request could not be completed', status: 403, code: 'V3_IDENTITY_EDGE_DENIED', traceId: randomUUID() });
  };
  return Object.freeze({
    async handle(request, response) {
      try {
        if (!secret) throw new Error();
        const seen = new Set();
        for (let index = 0; index < (request.rawHeaders?.length ?? 0); index += 2) {
          const name = request.rawHeaders[index].toLowerCase();
          if (boundHeaders.has(name) && seen.has(name)) throw new Error(); seen.add(name);
        }
        const socket = request.socket;
        if (!(socket instanceof TLSSocket) || socket.encrypted !== true || socket.authorized !== true || !['TLSv1.2', 'TLSv1.3'].includes(socket.getProtocol())) throw new Error();
        const peer = socket.getPeerCertificate();
        if (!Buffer.isBuffer(peer?.raw)) throw new Error();
        const cert = new X509Certificate(peer.raw), now = Date.now();
        if (now < Date.parse(cert.validFrom) || now >= Date.parse(cert.validTo) || cert.subjectAltName !== IDENTITY_PROXY_SAN || !cert.keyUsage?.includes('1.3.6.1.5.5.7.3.2')) throw new Error();
        if (!ingressMeta(request, secret, now).ingressTrusted) throw new Error();
        authority.capture(request);
      } catch {
        if(secret&&preauthObserver)void preauthObserver.observe(request,'INGRESS').catch(()=>{});
        deny(request, response); return;
      }
      if (!await router.handle(request, response)) {
        response.setHeader('connection', 'close'); response.once('finish', () => request.destroy());
        sendProblem(response, { type: 'about:blank', title: 'Resource not found', status: 404, code: 'V3_ROUTE_NOT_FOUND', traceId: randomUUID() });
      }
    },
    dispose() { router.dispose(); authority.dispose();secret?.fill(0); secret = null; },
  });
}
