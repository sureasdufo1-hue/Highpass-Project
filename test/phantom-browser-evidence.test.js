import test from 'node:test';
import assert from 'node:assert/strict';
import {verifyPhantomPixels} from '../scripts/phantom-browser-evidence.js';
const studyUid='1.2.826.0.1.3680043.10.5432.20261009.1';
const fixture=()=>({studyUid,rows:Array.from({length:12},(_,i)=>({'00080018':{Value:[`${studyUid}.1.${i+1}`]}})),width:256,height:256,nextSlice:true});
test('only exact 12 fixed SOPs, decoded 256 pixels and next slice prove phantom browser flow',()=>assert.equal(verifyPhantomPixels(fixture()).result,'PASS'));
test('old 2x2, fake count, duplicate, missing, foreign SOP, wrong Study and no movement cannot pass',()=>{
  for(const change of [x=>x.width=2,x=>x.rows.pop(),x=>x.rows[1]=x.rows[0],x=>x.rows[0]={},x=>x.rows[0]['00080018'].Value[0]='foreign',x=>x.studyUid='other',x=>x.nextSlice=false]) {
    const value=fixture();change(value);assert.equal(verifyPhantomPixels(value).result,'FAIL');
  }
});
