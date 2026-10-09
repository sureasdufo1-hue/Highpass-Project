import test from 'node:test';
import assert from 'node:assert/strict';
import { createPatientQrController, validTicketReceipt } from '../public/ui/patient.js';

const handoff = { ticketId:'ticket-1', qr:{payload:'https://hipass.example/t/abcdefghijklmnopqrstuvwx', expiresAt:'2026-10-10T00:10:00.000Z'} };
const receipt = status => ({ticketId:'ticket-1', consentId:'consent-1', expiresAt:handoff.qr.expiresAt, status});
const settle = () => new Promise(resolve => setImmediate(resolve));
function fixture(readStatus) {
  let time = Date.parse('2026-10-10T00:00:00.000Z'), scheduled = null;
  const views = [];
  const controller = createPatientQrController({readStatus, render:v=>views.push(v), now:()=>time,
    schedule:fn=>{scheduled=fn;return 1;}, cancel:()=>{scheduled=null;}});
  return {controller, views, advance:ms=>{time+=ms;}, active:()=>scheduled !== null};
}
test('QR is exposed only after exact server receipt; invalid owner, ticket, expiry and state are rejected', async () => {
  for (const bad of [{...receipt('ISSUED'),consentId:'other'}, {...receipt('ISSUED'),ticketId:'other'}, {...receipt('ISSUED'),expiresAt:'2030-01-01'}, receipt('UNKNOWN')]) {
    assert.equal(validTicketReceipt(bad,{...handoff,consentId:'consent-1'}),false);
    const f=fixture(async()=>bad);f.controller.set(handoff,'consent-1');await settle();
    assert.ok(f.views.every(v=>v.payload===null));f.controller.clear();
  }
});
test('used, revoked and expired server states erase QR and stop polling', async () => {
  for (const state of ['USED','REVOKED','EXPIRED']) {
    let status='ISSUED';const f=fixture(async()=>receipt(status));
    f.controller.set(handoff,'consent-1');await settle();assert.equal(f.views.at(-1).payload,handoff.qr.payload);
    status=state;f.advance(5000);await f.controller.tick();
    assert.equal(f.views.at(-1).payload,null);assert.equal(f.active(),false);
  }
});
test('late receipt after local revocation cannot restore QR', async () => {
  let finish;const f=fixture(()=>new Promise(resolve=>{finish=resolve;}));
  f.controller.set(handoff,'consent-1');f.controller.clear('철회 확인 중');finish(receipt('ISSUED'));await settle();
  assert.equal(f.views.at(-1).label,'철회 확인 중');assert.equal(f.views.at(-1).payload,null);assert.equal(f.active(),false);
});
test('network failure conceals QR; later verified status can recover within expiry', async () => {
  let failed=true;const f=fixture(async()=>{if(failed)throw Error('offline');return receipt('ISSUED');});
  f.controller.set(handoff,'consent-1');await settle();assert.equal(f.views.at(-1).payload,null);
  failed=false;f.advance(5000);await f.controller.tick();assert.equal(f.views.at(-1).payload,handoff.qr.payload);f.controller.clear();
});
test('local expiry clears QR even when status request is in flight', async () => {
  let finish;const f=fixture(()=>new Promise(resolve=>{finish=resolve;}));f.controller.set(handoff,'consent-1');
  f.advance(600001);await f.controller.tick();finish(receipt('ISSUED'));await settle();
  assert.equal(f.views.at(-1).payload,null);assert.equal(f.active(),false);
});
