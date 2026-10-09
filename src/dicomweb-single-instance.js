export class DicomwebInstanceError extends Error {
  constructor(code) { super(code); this.code=code; this.name="DicomwebInstanceError"; }
}

// Selected single-instance WADO-RS only; never scan for DICM inside arbitrary bytes.
export function extractSingleDicomInstance({body,contentType}) {
  if(!Buffer.isBuffer(body)||body.length>33554432||typeof contentType!=="string"||contentType.length>512||/[\r\n]/.test(contentType)) throw new DicomwebInstanceError("DICOM_RESPONSE_INVALID");
  let dicom=body;
  if(/^multipart\/related\s*;/i.test(contentType)) {
    const boundaryMatch=contentType.match(/(?:^|;)\s*boundary=(?:"([A-Za-z0-9'()+_,./:=?-]{1,70})"|([A-Za-z0-9'()+_,./:=?-]{1,70}))\s*(?:;|$)/i);
    if(!boundaryMatch||!/(?:^|;)\s*type=(?:"application\/dicom"|application\/dicom)\s*(?:;|$)/i.test(contentType)) throw new DicomwebInstanceError("DICOM_MULTIPART_INVALID");
    const boundary=boundaryMatch[1]??boundaryMatch[2];
    if((contentType.match(/(?:^|;)\s*boundary=/ig)??[]).length!==1||(contentType.match(/(?:^|;)\s*type=/ig)??[]).length!==1) throw new DicomwebInstanceError("DICOM_MULTIPART_INVALID");
    const first=Buffer.from(`--${boundary}\r\n`);
    const last=Buffer.from(`\r\n--${boundary}--`);
    if(!body.subarray(0,first.length).equals(first)) throw new DicomwebInstanceError("DICOM_MULTIPART_INVALID");
    const headerEnd=body.indexOf(Buffer.from("\r\n\r\n"),first.length);
    if(headerEnd<first.length||headerEnd-first.length>8192) throw new DicomwebInstanceError("DICOM_MULTIPART_INVALID");
    const headerBytes=body.subarray(first.length,headerEnd);
    if(headerBytes.some(byte=>byte>126||(byte<32&&![9,10,13].includes(byte)))) throw new DicomwebInstanceError("DICOM_MULTIPART_INVALID");
    const lines=headerBytes.toString("ascii").split("\r\n");
    const types=lines.filter(line=>/^content-type:/i.test(line));
    if(types.length!==1||!/^content-type:\s*application\/dicom\s*$/i.test(types[0])) throw new DicomwebInstanceError("DICOM_MULTIPART_INVALID");
    let end=body.length;
    if(body.subarray(end-2).toString()==="\r\n") end-=2;
    const finalStart=end-last.length;
    if(finalStart<headerEnd+4||!body.subarray(finalStart,end).equals(last)) throw new DicomwebInstanceError("DICOM_MULTIPART_INVALID");
    const start=headerEnd+4;
    if(body.indexOf(Buffer.from(`\r\n--${boundary}`),start)!==finalStart) throw new DicomwebInstanceError("DICOM_MULTIPLE_INSTANCES_NOT_ALLOWED");
    dicom=body.subarray(start,finalStart);
    const lengths=lines.filter(line=>/^content-length:/i.test(line));
    if(lengths.length>1||(lengths.length===1&&!new RegExp(`^content-length:\\s*${dicom.length}\\s*$`,"i").test(lengths[0]))) throw new DicomwebInstanceError("DICOM_MULTIPART_INVALID");
  } else if(!/^application\/dicom(?:\s*;|$)/i.test(contentType)) throw new DicomwebInstanceError("DICOM_CONTENT_TYPE_INVALID");
  if(dicom.length<132||dicom.subarray(128,132).toString("ascii")!=="DICM") throw new DicomwebInstanceError("DICOM_FILE_INVALID");
  return Buffer.from(dicom);
}
