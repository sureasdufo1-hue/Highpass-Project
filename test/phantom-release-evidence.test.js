import test from 'node:test';
import assert from 'node:assert/strict';
import {classifyPhantomReleases} from '../scripts/phantom-release-evidence.js';

const complete={total:4,consumed:4,vault:4,consumedAudited:4,unconsumedExpired:0,unconsumedDenied:0};
test('every consumed release needs its own wrap/precheck/consume trail and pinned Vault',()=>{
  assert.equal(classifyPhantomReleases(complete,true),'PASS');
  assert.equal(classifyPhantomReleases({...complete,consumedAudited:3},true),'FAIL');
  assert.equal(classifyPhantomReleases({...complete,vault:3},true),'FAIL');
  assert.equal(classifyPhantomReleases(complete,false),'FAIL');
});
test('an unused prepared release is accounted for only with expiry and explicit denial',()=>{
  const mixed={...complete,total:5,vault:5,unconsumedExpired:1,unconsumedDenied:1};
  assert.equal(classifyPhantomReleases(mixed,true),'PASS');
  assert.equal(classifyPhantomReleases({...mixed,unconsumedDenied:0},true),'NOT VERIFIED');
  assert.equal(classifyPhantomReleases({...mixed,unconsumedExpired:0},true),'NOT VERIFIED');
  assert.equal(classifyPhantomReleases({...mixed,consumedAudited:0},true),'FAIL');
  assert.equal(classifyPhantomReleases({},true),'NOT VERIFIED');
  assert.equal(classifyPhantomReleases({...complete,consumed:0},true),'FAIL');
});
