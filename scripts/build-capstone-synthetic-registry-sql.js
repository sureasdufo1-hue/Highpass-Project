import {readFileSync} from 'node:fs';
import {validateCapstoneSyntheticRegistry,buildCapstoneSyntheticRegistrySql} from '../src/v3-capstone-synthetic-registry.js';
const bundle=validateCapstoneSyntheticRegistry(JSON.parse(readFileSync('config/capstone-v3-synthetic-registry-20261009.json','utf8')));
console.log(JSON.stringify({registrySha256:bundle.sha256,snapshot:bundle.snapshot,sql:buildCapstoneSyntheticRegistrySql(bundle,{targetDatabase:'highpass_v3_capstone'})}));
