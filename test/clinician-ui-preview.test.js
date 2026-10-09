import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { renderDicomToBmp } from '../src/orthanc-client.js';
import { createPhantomInstance } from '../scripts/test-support/synthetic-phantom.js';

const source = readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
const controller = source.slice(source.indexOf('function showSeriesImage('), source.indexOf('function showViewerMessage('));
function image() { return { hidden:true, src:'', removeAttribute(name) { delete this[name]; } }; }
function setup() {
  const viewerImage=image(), preview=image(), other=image();
  const context=vm.createContext({ viewerImage, viewerPlaceholder:{hidden:false}, instanceDetail:{}, selectedSeriesUid:'1.2.3',
    document:{ querySelectorAll(selector) {
      return selector === '.hp-series-preview' ? [preview,other] : [
        { dataset:{viewerSeriesUid:'1.2.3'}, querySelector:()=>preview },
        { dataset:{viewerSeriesUid:'1.2.4'}, querySelector:()=>other },
      ];
    } },
  });
  vm.runInContext(controller,context);
  return {context,viewerImage,preview,other};
}
test('clinician preview shares only selected authorized blob; clearing removes all pixel references',()=>{
  const {context,viewerImage,preview,other}=setup();
  vm.runInContext('showSeriesImage("blob:synthetic-authorized", "Slice 1")',context);
  assert.equal(preview.src,viewerImage.src); assert.equal(preview.hidden,false); assert.equal(other.hidden,true);
  vm.runInContext('hideSeriesImage()',context);
  for(const item of [viewerImage,preview,other]) { assert.equal(item.hidden,true); assert.equal(item.src,undefined); }
});
test('clinician viewport never substitutes static or external illustrative images',()=>{
  const {context,viewerImage}=setup();
  for(const url of ['/assets/demo-ct.png','https://example.invalid/image.jpg','data:image/png;base64,AAAA']) {
    vm.runInContext(`showSeriesImage(${JSON.stringify(url)}, "example")`,context);
    assert.equal(viewerImage.hidden,true); assert.equal(viewerImage.src,undefined);
  }
  assert.equal(source.includes('resolvePreviewForSelectedSeries'),false);
});
for(const modality of ['CT','MR']) test(`${modality} actual synthetic DICOM pixels decode to 256x256 distinct BMP slices`,()=>{
  const first=renderDicomToBmp(createPhantomInstance(modality,1).dicom);
  const next=renderDicomToBmp(createPhantomInstance(modality,2).dicom);
  assert.ok(first && next); assert.equal(first.subarray(0,2).toString(),'BM');
  assert.equal(first.readInt32LE(18),256); assert.equal(Math.abs(first.readInt32LE(22)),256);
  assert.equal(first.equals(next),false);
});
test('truncated synthetic PixelData fails closed without a substitute image',()=>{
  const {dicom}=createPhantomInstance('CT',1);
  assert.equal(renderDicomToBmp(dicom.subarray(0,dicom.length-100)),null);
});
