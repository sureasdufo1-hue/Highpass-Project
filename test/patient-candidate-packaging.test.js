import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

test('patient candidate retains inherited runtime and ships matching Control/A/B sources',async()=>{
  const dockerfile=await readFile(new URL('../Dockerfile.patient-capstone',import.meta.url),'utf8');
  assert.match(dockerfile,/FROM \$\{CAPSTONE_BASE_IMAGE\}/);
  for(const dir of ['src','scripts','db','public','config'])assert.match(dockerfile,new RegExp(`^COPY ${dir} /app/${dir}$`,'m'));
  assert.doesNotMatch(dockerfile,/^\s*(?:RUN|ADD|CMD|ENTRYPOINT|USER|EXPOSE|VOLUME)\b/m);
  const ignore=await readFile(new URL('../.dockerignore',import.meta.url),'utf8');
  for(const excluded of ['.env','.env.*','data','artifacts','node_modules','.git'])assert.ok(ignore.split(/\r?\n/).includes(excluded));
});
