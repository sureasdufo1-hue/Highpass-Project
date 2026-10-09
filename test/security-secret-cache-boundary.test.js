import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';import path from 'node:path';import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
test('generated Python cache is excluded but Python source secrets still fail the gate',async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),'highpass-secret-cache-test-'));
 const script=fileURLToPath(new URL('../scripts/security-secret-scan.js',import.meta.url));
 const marker='-----BEGIN '+'PRIVATE KEY-----';
 const scan=()=>spawnSync(process.execPath,[script],{cwd:dir,encoding:'utf8',timeout:5000,windowsHide:true});
 try{
  await mkdir(path.join(dir,'__pycache__'));
  await writeFile(path.join(dir,'__pycache__','generated.pyc'),marker);
  await writeFile(path.join(dir,'application.py'),'# no credentials\n');
  const clean=scan();assert.equal(clean.status,0,clean.stderr);assert.equal(JSON.parse(clean.stdout).status,'PASS');
  await writeFile(path.join(dir,'application.py'),marker);
  const unsafe=scan();assert.equal(unsafe.status,1);
  assert.deepEqual(JSON.parse(unsafe.stdout).findings,[{id:'PRIVATE_KEY_BLOCK',file:'application.py',line:1}]);
 }finally{await rm(dir,{recursive:true,force:true});}
});
