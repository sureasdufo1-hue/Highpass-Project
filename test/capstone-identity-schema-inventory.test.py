"""Catalog inventory validation only; real cloud evidence is separate."""
import importlib.util
import pathlib
import re
import unittest

ROOT = pathlib.Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location('inventory', ROOT / 'scripts/capstone-identity-schema-inventory.py')
inventory = importlib.util.module_from_spec(spec)
spec.loader.exec_module(inventory)


class InventoryTests(unittest.TestCase):
    def fixture(self):
        return {'transactionReadOnly': 'on', 'database': 'hipass', 'inspectionRole': 'hipass_bootstrap',
                'serverMajor': 16, 'v3SchemaPresent': False, 'identityTables': [], 'v3TableCount': 0, 'roles': [], 'targetDatabasePresent': False}

    def test_absent_schema_is_inventory_not_deployment_success(self):
        value = inventory.validate(self.fixture())
        self.assertFalse(value['v3SchemaPresent'])
        self.assertEqual(value['identityTables'], [])
        self.assertNotIn('deploymentReadiness', value)

    def test_readonly_database_and_inspection_role_must_match(self):
        for patch in [{'transactionReadOnly': 'off'}, {'database': 'other'}, {'inspectionRole': 'hipass_app'},
                      {'serverMajor': True}, {'v3TableCount': -1}]:
            with self.assertRaises(RuntimeError):
                inventory.validate({**self.fixture(), **patch})
        target={**self.fixture(),'database':'highpass_v3_capstone'}
        self.assertEqual(inventory.validate(target,'highpass_v3_capstone')['database'],'highpass_v3_capstone')
        with self.assertRaises(RuntimeError):
            inventory.validate(target,'unselected')

    def test_no_raw_fields_unknown_names_duplicates_or_untyped_flags(self):
        table = {'name': 'tenants', 'rls': True, 'forceRls': True}
        for patch in [{'token': 'DO_NOT_OUTPUT'}, {'identityTables': [{**table, 'raw': 'DO_NOT_OUTPUT'}]},
                      {'identityTables': [{**table, 'name': 'patient_name'}]}, {'identityTables': [table, table]},
                      {'identityTables': [{**table, 'rls': 1}]}, {'roles': [{'name': 'UNREVIEWED_ROLE'}]}]:
            with self.assertRaises(RuntimeError):
                inventory.validate({**self.fixture(), **patch})

    def test_fixed_sql_is_readonly_and_never_selects_patient_rows_or_credentials(self):
        sql = (ROOT / 'scripts/capstone-identity-schema-inventory.sql').read_text(encoding='utf8')
        self.assertIn('BEGIN READ ONLY;', sql)
        self.assertIn('ROLLBACK;', sql)
        self.assertIn("current_setting('transaction_read_only')", sql)
        self.assertFalse(re.search(r'^\s*(CREATE|ALTER|DROP|INSERT|UPDATE|DELETE|GRANT|REVOKE|TRUNCATE|COPY)\b', sql, re.M))
        self.assertNotIn('rolpassword', sql)
        self.assertFalse(re.search(r'\bFROM\s+highpass_v3\.', sql, re.I))


if __name__ == '__main__':
    unittest.main()
