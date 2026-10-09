import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const source=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
const section=(start,end)=>source.slice(source.indexOf(start),source.indexOf(end,source.indexOf(start)));

function fixture(capstone='1') {
  const deadlines=[], requests=[];
  class BrowserURL extends URL {static createObjectURL(){return 'blob:synthetic';}}
  const context=vm.createContext({Headers,URL:BrowserURL,atob,
    location:{origin:'https://synthetic.invalid'},document:{documentElement:{dataset:{capstone}}},
    AbortSignal:{timeout:ms=>{deadlines.push(ms);return {deadline:ms};}},
    fetch:async(path,options)=>{requests.push({path,deadline:options.signal.deadline});return {ok:true,blob:async()=>({})};},
    latestToken:'test-only',consentMutationPending:false,lastInstances:[{},{}],
    selectedStudyUid:'1.2.3',selectedSeriesUid:'1.2.3.1',selectedSopUid:'',totalSlices:2,
    currentSliceIndex:0,instanceDetail:null,viewerStatus:{},sliceBlobCache:new Map(),prefetching:false,
    currentTokenRequestContext:()=> 'fixed-context',updateSliceControlsUi(){},dicomValue:()=> '1.2.3.1.1',
    setDownloadState(){},showSeriesImage(){},prefetchAdjacentSlices(){},requireToken:()=>true,
    clearSliceBlobCache(){},hideSeriesImage(){},showViewerMessage(){},
  });
  vm.runInContext(section('async function proofFetch','function developmentPrincipalHeaders'),context);
  return {context,deadlines,requests};
}

test('foreground rendered slice uses existing 35s capstone budget, not a shadow 10s timer',async()=>{
  const {context,deadlines}=fixture();
  vm.runInContext(section('async function displaySlice','function stepSlice'),context);
  await vm.runInContext('displaySlice(0)',context);
  assert.deepEqual(deadlines,[35000]);
});

test('prefetched rendered slices use the same finite encrypted-path budget',async()=>{
  const {context,deadlines}=fixture();
  vm.runInContext(section('async function prefetchAdjacentSlices','function startCinePlayback'),context);
  await vm.runInContext('prefetchAdjacentSlices(0)',context);
  assert.deepEqual(deadlines,[35000]);
});

test('metadata/non-capstone budgets and explicit caller cancellation remain unchanged',async()=>{
  const {context,deadlines}=fixture();
  await vm.runInContext("proofFetch('/dicomweb/studies/1/series/2/instances/3/metadata')",context);
  await vm.runInContext("proofFetch('/api/health',{signal:{deadline:123}})",context);
  assert.deepEqual(deadlines,[20000]);
  const other=fixture('0');
  await vm.runInContext("proofFetch('/dicomweb/studies/1/series/2/instances/3/rendered')",other.context);
  assert.deepEqual(other.deadlines,[20000]);
});
