import test from "node:test";
import assert from "node:assert/strict";
import {extractSingleDicomInstance} from "../src/dicomweb-single-instance.js";
const dicom=Buffer.alloc(180);dicom.write("DICM",128);dicom[160]=255;
const boundary="capstone-fixture-123";
const type=`multipart/related; type="application/dicom"; boundary=${boundary}`;
const multipart=Buffer.concat([Buffer.from(`--${boundary}\r\nContent-Type: application/dicom\r\nContent-Length: ${dicom.length}\r\n\r\n`),dicom,Buffer.from(`\r\n--${boundary}--\r\n`)]);
test("single-instance WADO preserves binary DICOM without multipart headers",()=>{
  assert.deepEqual(extractSingleDicomInstance({body:multipart,contentType:type}),dicom);
  assert.deepEqual(extractSingleDicomInstance({body:dicom,contentType:"application/dicom"}),dicom);
  assert.deepEqual(extractSingleDicomInstance({body:multipart.subarray(0,-2),contentType:type}),dicom);
});
test("rejects extra parts, boundary injection, length mismatch and arbitrary DICM scan",()=>{
  const extra=Buffer.concat([multipart.subarray(0,-(boundary.length+8)),Buffer.from(`\r\n--${boundary}\r\nContent-Type: application/dicom\r\n\r\n`),dicom,Buffer.from(`\r\n--${boundary}--\r\n`)]);
  for(const candidate of [{body:extra,contentType:type},{body:multipart,contentType:type+"\r\nInjected:x"},{body:Buffer.from(multipart.toString("latin1").replace("Content-Length: 180","Content-Length: 181"),"latin1"),contentType:type},{body:Buffer.concat([Buffer.from("arbitrary"),dicom]),contentType:"application/dicom"},{body:dicom,contentType:"application/json"}]) assert.throws(()=>extractSingleDicomInstance(candidate));
});
