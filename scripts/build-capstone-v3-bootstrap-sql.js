import {readFileSync} from 'node:fs';
import {readCapstoneV3MigrationBundle,buildCapstoneV3BootstrapSql} from '../src/v3-capstone-migration-bundle.js';
const bundle=readCapstoneV3MigrationBundle({root:process.cwd(),manifest:JSON.parse(readFileSync('config/capstone-v3-migrations-20261009.json','utf8'))});
// Consumed privately by the pinned administrative operator; no secret/data rows.
console.log(JSON.stringify({bundleSha256:bundle.digest,migrations:bundle.entries.map(({file,sha256})=>({file,sha256})),
 sql:buildCapstoneV3BootstrapSql(bundle,{targetDatabase:'highpass_v3_capstone'})}));
