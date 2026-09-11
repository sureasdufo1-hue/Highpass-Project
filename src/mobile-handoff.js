import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

export const HandoffState = Object.freeze({
  CREATED: "CREATED",
  ISSUED: "ISSUED",
  SCANNED: "SCANNED",
  PATIENT_APPROVED: "PATIENT_APPROVED",
  AUTHORIZED: "AUTHORIZED",
  CONSUMED: "CONSUMED",
  EXPIRED: "EXPIRED",
  REVOKED: "REVOKED",
  REPLAY_BLOCKED: "REPLAY_BLOCKED",
  REJECTED: "REJECTED",
});

export class MobileHandoffError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "MobileHandoffError";
    this.code = code;
  }
}

export class MobileHandoffBroker {
  #sessions = new Map();
  #tickets = new Map();
  #audit = [];
  #clock;

  constructor({ clock = () => new Date(), publicBaseUrl = "https://hipass.example" } = {}) {
    this.#clock = clock;
    this.publicBaseUrl = publicBaseUrl.replace(/\/$/u, "");
  }

  createHandoff({ handoffId, transferId, packageId, targetInstitutionRef, clinicianRef, gatewayRef, purpose, scope, expiresAt }) {
    for (const [name, value] of Object.entries({ handoffId, transferId, packageId, targetInstitutionRef, clinicianRef, gatewayRef, purpose })) {
      if (typeof value !== "string" || value.length === 0 || value.length > 128) throw new MobileHandoffError("HANDOFF_INPUT_INVALID", `${name} is invalid`);
    }
    if (!scope || !Array.isArray(scope.studyRefs) || scope.studyRefs.length === 0) throw new MobileHandoffError("HANDOFF_SCOPE_REQUIRED", "handoff scope is required");
    const expiry = new Date(expiresAt);
    if (!Number.isFinite(expiry.getTime()) || expiry <= this.#now()) throw new MobileHandoffError("HANDOFF_EXPIRY_INVALID", "handoff expiry is invalid");
    if (this.#sessions.has(handoffId)) throw new MobileHandoffError("HANDOFF_EXISTS", "handoff already exists");
    const session = { handoffId, transferId, packageId, targetInstitutionRef, clinicianRef, gatewayRef, purpose, scope: clone(scope), status: HandoffState.CREATED, expiresAt: expiry.toISOString(), createdAt: this.#now().toISOString() };
    this.#sessions.set(handoffId, session);
    this.#record("HANDOFF_CREATED", session);
    return publicSession(session);
  }

  issueTicket(handoffId) {
    const session = this.#requireSession(handoffId);
    this.#ensureUsable(session);
    if (session.status !== HandoffState.CREATED) throw new MobileHandoffError("HANDOFF_STATE_DENIED", "ticket can only be issued once from CREATED");
    const nonce = randomBytes(32).toString("base64url");
    const ticketId = `htk_${randomBytes(16).toString("base64url")}`;
    const ticket = { ticketId, handoffId, nonceHash: digest(nonce), status: HandoffState.ISSUED, issuedAt: this.#now().toISOString(), expiresAt: session.expiresAt };
    this.#tickets.set(ticketId, ticket);
    session.ticketId = ticketId;
    session.status = HandoffState.ISSUED;
    this.#record("TICKET_ISSUED", session, ticketId);
    return { ticketId, status: ticket.status, expiresAt: ticket.expiresAt, qr: { payload: `${this.publicBaseUrl}/t/${nonce}`, expiresAt: ticket.expiresAt } };
  }

  scanTicket(payload, receiverInstitutionRef) {
    const ticket = this.#findByPayload(payload);
    const session = this.#requireSession(ticket.handoffId);
    this.#ensureUsable(session, ticket);
    if (receiverInstitutionRef !== session.targetInstitutionRef) return this.#deny(ticket, session, "HANDOFF_INSTITUTION_MISMATCH");
    if (ticket.status !== HandoffState.ISSUED) return this.#deny(ticket, session, "HANDOFF_STATE_DENIED");
    ticket.status = HandoffState.SCANNED;
    session.status = HandoffState.SCANNED;
    this.#record("TICKET_SCANNED", session, ticket.ticketId);
    return { decision: "ALLOW", ticketId: ticket.ticketId, handoffId: session.handoffId, status: ticket.status };
  }

  approve(handoffId) {
    const session = this.#requireSession(handoffId);
    this.#ensureUsable(session);
    if (session.status !== HandoffState.SCANNED) throw new MobileHandoffError("HANDOFF_STATE_DENIED", "patient approval requires a scanned ticket");
    session.status = HandoffState.PATIENT_APPROVED;
    this.#record("HANDOFF_PATIENT_APPROVED", session, session.ticketId);
    return publicSession(session);
  }

  authorize(handoffId, clinicianRef) {
    const session = this.#requireSession(handoffId);
    this.#ensureUsable(session);
    if (clinicianRef !== session.clinicianRef) return this.#deny(session.ticketId ? this.#tickets.get(session.ticketId) : null, session, "HANDOFF_CLINICIAN_MISMATCH");
    if (session.status !== HandoffState.PATIENT_APPROVED) throw new MobileHandoffError("HANDOFF_STATE_DENIED", "authorization requires patient approval");
    session.status = HandoffState.AUTHORIZED;
    this.#record("HANDOFF_AUTHORIZED", session, session.ticketId);
    return publicSession(session);
  }

  consume(payload, receiverInstitutionRef) {
    const ticket = this.#findByPayload(payload);
    const session = this.#requireSession(ticket.handoffId);
    this.#ensureUsable(session, ticket);
    if (receiverInstitutionRef !== session.targetInstitutionRef) return this.#deny(ticket, session, "HANDOFF_INSTITUTION_MISMATCH");
    if (ticket.status === HandoffState.CONSUMED || ticket.status === HandoffState.REPLAY_BLOCKED) return this.#deny(ticket, session, "TICKET_REPLAY_BLOCKED");
    if (ticket.status !== HandoffState.AUTHORIZED && session.status !== HandoffState.AUTHORIZED) return this.#deny(ticket, session, "HANDOFF_NOT_AUTHORIZED");
    // CAS semantics: transition the stored ticket before returning its scoped result.
    ticket.status = HandoffState.CONSUMED;
    ticket.usedAt = this.#now().toISOString();
    session.status = HandoffState.CONSUMED;
    this.#record("TICKET_CONSUMED", session, ticket.ticketId);
    return { decision: "ALLOW", ticketId: ticket.ticketId, handoffId: session.handoffId, packageId: session.packageId, scope: clone(session.scope), purpose: session.purpose };
  }

  revoke(handoffId, reason = "POLICY_REVOKED") {
    const session = this.#requireSession(handoffId);
    session.status = HandoffState.REVOKED;
    if (session.ticketId) this.#tickets.get(session.ticketId).status = HandoffState.REVOKED;
    this.#record("HANDOFF_REVOKED", session, session.ticketId, reason);
    return publicSession(session);
  }

  getSession(handoffId) { return publicSession(this.#requireSession(handoffId)); }
  auditEvents() { return this.#audit.map((event) => ({ ...event })); }
  storedTickets() { return [...this.#tickets.values()].map(({ nonceHash, ...ticket }) => ({ ...ticket, nonceHash: `${nonceHash.slice(0, 12)}…` })); }

  #findByPayload(payload) {
    if (typeof payload !== "string") throw new MobileHandoffError("TICKET_INVALID", "ticket payload is invalid");
    const match = new RegExp(`${escapeRegex(this.publicBaseUrl)}/t/([A-Za-z0-9_-]{43})$`, "u").exec(payload);
    if (!match) throw new MobileHandoffError("TICKET_INVALID", "ticket payload must contain only one opaque nonce");
    const hash = digest(match[1]);
    const ticket = [...this.#tickets.values()].find((candidate) => constantTimeEqual(candidate.nonceHash, hash));
    if (!ticket) throw new MobileHandoffError("TICKET_INVALID", "ticket is unknown or invalid");
    return ticket;
  }

  #requireSession(handoffId) { const session = this.#sessions.get(handoffId); if (!session) throw new MobileHandoffError("HANDOFF_NOT_FOUND", "handoff is not found"); return session; }
  #ensureUsable(session, ticket = null) {
    if (session.status === HandoffState.REVOKED || ticket?.status === HandoffState.REVOKED) throw new MobileHandoffError("HANDOFF_REVOKED", "handoff is revoked");
    if (new Date(session.expiresAt) <= this.#now() || (ticket && new Date(ticket.expiresAt) <= this.#now())) {
      session.status = HandoffState.EXPIRED;
      if (ticket) ticket.status = HandoffState.EXPIRED;
      this.#record("HANDOFF_EXPIRED", session, ticket?.ticketId);
      throw new MobileHandoffError("HANDOFF_EXPIRED", "handoff has expired");
    }
  }
  #deny(ticket, session, reasonCode) { if (ticket && ticket.status === HandoffState.CONSUMED) ticket.status = HandoffState.REPLAY_BLOCKED; this.#record("HANDOFF_DENIED", session, ticket?.ticketId, reasonCode); return { decision: "DENIED", reasonCode }; }
  #now() { const value = this.#clock(); return value instanceof Date ? value : new Date(value); }
  #record(action, session, ticketId = null, reasonCode = null) { this.#audit.push({ action, handoffId: session.handoffId, ...(ticketId ? { ticketId } : {}), ...(reasonCode ? { reasonCode } : {}), eventTime: this.#now().toISOString() }); }
}

function publicSession(session) { const { scope, ...safe } = session; return { ...safe }; }
function clone(value) { return JSON.parse(JSON.stringify(value)); }
function digest(value) { return createHash("sha256").update(value).digest("base64url"); }
function constantTimeEqual(a, b) { const left = Buffer.from(a); const right = Buffer.from(b); return left.length === right.length && timingSafeEqual(left, right); }
function escapeRegex(value) { return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&"); }

