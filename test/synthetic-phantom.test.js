import test from 'node:test';
import assert from 'node:assert/strict';
import { createPhantomInstance, phantomPixels } from '../scripts/test-support/synthetic-phantom.js';

function tags(buffer) {
  const result = new Map();
  assert.equal(buffer.subarray(128, 132).toString(), 'DICM');
  for (let offset = 132; offset < buffer.length;) {
    const group = buffer.readUInt16LE(offset), tag = buffer.readUInt16LE(offset + 2), vr = buffer.subarray(offset + 4, offset + 6).toString();
    const wide = ['OB', 'OW'].includes(vr), header = wide ? 12 : 8;
    const length = wide ? buffer.readUInt32LE(offset + 8) : buffer.readUInt16LE(offset + 6);
    assert.equal(length % 2, 0); assert.ok(offset + header + length <= buffer.length);
    result.set(`${group.toString(16)}:${tag.toString(16)}`, buffer.subarray(offset + header, offset + header + length));
    offset += header + length;
  }
  return result;
}
test('phantom dataset is deterministic, 24 distinct valid UIDs and changing 256x256 slices', () => {
  const uids = new Set(), pixels = new Set();
  for (const modality of ['CT', 'MR']) for (let slice = 1; slice <= 12; slice++) {
    const sample = createPhantomInstance(modality, slice), parsed = tags(sample.dicom);
    assert.deepEqual(sample.dicom, createPhantomInstance(modality, slice).dicom);
    for (const uid of [sample.studyUid, sample.seriesUid, sample.sopUid]) {
      assert.ok(uid.length <= 64); assert.match(uid, /^(0|[1-9]\d*)(\.(0|[1-9]\d*))+$/);
    }
    uids.add(sample.sopUid); pixels.add(phantomPixels(modality, slice).toString('base64'));
    assert.equal(parsed.get('28:10').readUInt16LE(), 256); assert.equal(parsed.get('28:11').readUInt16LE(), 256);
    assert.equal(parsed.get('7fe0:10').length, 65536);
    assert.match(parsed.get('10:20').toString(), /^HP-TEST-/);
    assert.match(parsed.get('8:1030').toString(), /SYNTHETIC.*NOT DIAGNOSTIC/);
    assert.equal(parsed.get('8:16').toString().replace(/\0/g, ''), '1.2.840.10008.5.1.4.1.1.7');
    assert.equal(parsed.get('28:301').toString().trim(), 'YES');
  }
  assert.equal(uids.size, 24); assert.equal(pixels.size, 24);
});
test('phantom input is bounded, no arbitrary modality or dimensions', () => {
  for (const [modality, slice] of [['CT', 0], ['MR', 13], ['CT', 1.5], ['OTHER', 1]]) assert.throws(() => createPhantomInstance(modality, slice), /PHANTOM_INPUT_INVALID/);
});
