export function verifyPhantomPixels({studyUid, rows, width, height, nextSlice}) {
  if (!/^1\.2\.826\.0\.1\.3680043\.10\.5432\.20261009\.[12]$/.test(studyUid ?? '')) return {result:'FAIL',reason:'FIXED_PHANTOM_STUDY_REQUIRED'};
  const ids = Array.isArray(rows) ? rows.map(row=>row?.['00080018']?.Value?.[0]) : [];
  const expected = new Set(Array.from({length:12},(_,i)=>`${studyUid}.1.${i+1}`));
  const exactInstances = ids.length===12 && new Set(ids).size===12 && ids.every(id=>expected.has(id));
  return {instanceCount:ids.length,uniqueInstances:new Set(ids).size,exactInstances,
    dimensions256:width===256 && height===256,nextSlice:nextSlice===true,
    result:exactInstances && width===256 && height===256 && nextSlice===true?'PASS':'FAIL'};
}
