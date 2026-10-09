import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

test('patient activation overlay uses separate readonly secret files without database mutation or Vault identity',async()=>{
  const text=await readFile(new URL('../infra/azure/capstone-control-patient.compose.yml',import.meta.url),'utf8');
  for(const name of ['HIPASS_PATIENT_AUTHORITY_PASSWORD','HIPASS_PATIENT_SELF_VIEW_SERVICE_TOKEN','HIPASS_PATIENT_KEY_RELEASE_SERVICE_TOKEN']){
    assert.match(text,new RegExp(`${name}_FILE: /run/secrets/`));
    assert.doesNotMatch(text,new RegExp(`^\\s+${name}:`,'m'));
  }
  assert.equal((text.match(/:ro$/gm)??[]).length,3);
  assert.match(text,/HIPASS_PATIENT_AUTHORITY_DATABASE_USER: hipass_patient_authority/);
  assert.match(text,/HIPASS_PATIENT_KEY_VAULT_KEY_ID: \$\{HIPASS_PATIENT_KEY_VAULT_KEY_ID:\?/);
  assert.doesNotMatch(text,/^\s+(?:command|entrypoint|ports|privileged|network_mode):/m);
  assert.doesNotMatch(text,/admin-password|key-identity|identity\.key|DATABASE_URL:/);
  const base=await readFile(new URL('../infra/azure/capstone-control.compose.yml',import.meta.url),'utf8');
  assert.doesNotMatch(base,/HIPASS_CAPSTONE_PATIENT_GRANTS|HIPASS_CAPSTONE_PATIENT_KEY_RELEASE/);
});
