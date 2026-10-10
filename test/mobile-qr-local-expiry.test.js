import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync('public/mobile/app.js','utf8');
const code=source.slice(source.indexOf('function expireActiveMobileTicket('),source.indexOf('function onQrConsumedByHospital('));

test('local QR deadline removes displayed and in-memory capability even without a server receipt',()=>{
  const ticket={qr:{expiresAt:'2026-10-09T00:10:00Z',payload:'opaque-test-capability'}};
  const nodes=new Map(), cleared=[];
  const state={activeTicket:ticket,countdownTimer:42}; let pollsStopped=0;
  const context=vm.createContext({state,Date,stopTicketStatusPolling(){pollsStopped++;},clearInterval(id){cleared.push(id);},document:{querySelector(selector){if(!nodes.has(selector)) nodes.set(selector,{});return nodes.get(selector);}}});
  vm.runInContext(code,context);
  vm.runInContext(`expireActiveMobileTicket(state.activeTicket, ${Date.parse(ticket.qr.expiresAt)-1})`,context);
  assert.equal(ticket.qr.payload,'opaque-test-capability'); assert.equal(nodes.size,0);
  vm.runInContext(`expireActiveMobileTicket(state.activeTicket, ${Date.parse(ticket.qr.expiresAt)})`,context);
  assert.equal(ticket.qr.payload,null); assert.equal(ticket.terminal,true); assert.equal(state.countdownTimer,null);
  assert.equal(pollsStopped,1); assert.deepEqual(cleared,[42]);
  assert.match(nodes.get('#qr-status-pill').textContent,/서버 접수 여부 미확인/);
  assert.match(nodes.get('#qr-box-wrap').textContent,/재사용 불가/);
});

test('expired stale ticket, malformed deadline and an already terminal ticket cannot replace current QR',()=>{
  const current={qr:{payload:'current',expiresAt:'2026-10-09T00:10:00Z'}};
  for(const ticket of [{qr:{expiresAt:'2020-01-01Z',payload:'old'}},{qr:{expiresAt:'invalid',payload:'bad'}},{terminal:true,qr:{expiresAt:'2020-01-01Z',payload:null}}]){
    const state={activeTicket:ticket.qr.payload==='old'?current:ticket};
    const context=vm.createContext({state,Date,ticket,document:{querySelector(){assert.fail('No current UI mutation');}},stopTicketStatusPolling(){assert.fail('No current timer mutation');}});
    vm.runInContext(code,context); vm.runInContext('expireActiveMobileTicket(ticket)',context);
    assert.equal(current.qr.payload,'current');
  }
});

test('auth-expired status followed by QR deadline still clears capability without claiming a server receipt',async()=>{
  const deadline=Date.parse('2026-10-10T01:10:00Z');
  const ticket={ticketId:'owned-unit-ticket',qr:{expiresAt:new Date(deadline).toISOString(),payload:'opaque-unit-capability'}};
  const state={activeTicket:ticket,activeConsent:{consentId:'owned-unit-consent',status:'ACTIVE'},isAuthenticated:true,countdownTimer:42,ticketStatusTimer:73};
  const nodes=new Map(),clearedIntervals=[],clearedPolls=[];
  const context=vm.createContext({state,Date,AbortSignal,encodeURIComponent,
    patientHeaders(){throw Object.assign(new Error('hidden diagnostic'),{code:'CAPSTONE_SESSION_EXPIRED'});},
    fetch(){assert.fail('Expired authentication must not send a request');},
    clearInterval(id){clearedIntervals.push(id);},clearTimeout(id){clearedPolls.push(id);},
    document:{querySelector(selector){if(!nodes.has(selector))nodes.set(selector,{});return nodes.get(selector);}}});
  vm.runInContext(code+'\n'+source.slice(source.indexOf('function stopTicketStatusPolling('),source.indexOf('async function requestMobileRevocation(')),context);
  await vm.runInContext('refreshActiveTicketStatus()',context);
  assert.equal(ticket.statusAuthExpired,true);assert.equal(state.countdownTimer,42);
  assert.match(nodes.get('#qr-status-pill').textContent,/다시 로그인/);
  vm.runInContext(`expireActiveMobileTicket(state.activeTicket,${deadline-1})`,context);
  assert.equal(ticket.qr.payload,'opaque-unit-capability');
  vm.runInContext(`expireActiveMobileTicket(state.activeTicket,${deadline})`,context);
  assert.equal(ticket.qr.payload,null);assert.equal(ticket.terminal,true);
  assert.equal(state.countdownTimer,null);assert.equal(state.ticketStatusTimer,null);
  assert.deepEqual(clearedIntervals,[42]);assert.deepEqual(clearedPolls,[73]);
  assert.match(nodes.get('#qr-status-pill').textContent,/EXPIRED.*서버 접수 여부 미확인/);
  assert.doesNotMatch(nodes.get('#qr-status-pill').textContent,/hidden|서버 확인 ·|사용 완료/);
});
