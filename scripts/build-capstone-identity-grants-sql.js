import {buildCapstoneIdentityGrantsSql,capstoneIdentityLoginRoles} from '../src/v3-capstone-identity-grants.js';
import {readCapstoneV3MigrationBundle} from '../src/v3-capstone-migration-bundle.js';
import {readFileSync} from 'node:fs';
const bundle=readCapstoneV3MigrationBundle({root:process.cwd(),manifest:JSON.parse(readFileSync('config/capstone-v3-migrations-20261009.json','utf8'))});
// Private administrative operator input, never includes passwords.
console.log(JSON.stringify({sql:buildCapstoneIdentityGrantsSql({targetDatabase:'highpass_v3_capstone'}),
 roles:capstoneIdentityLoginRoles,bundleSha256:bundle.digest}));
