import importlib.util
import json
import pathlib
import subprocess
import unittest
from unittest.mock import patch

ROOT=pathlib.Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('session_network_cloud',ROOT/'scripts/capstone-v3-session-network-cloud.py')
operator=importlib.util.module_from_spec(spec);spec.loader.exec_module(operator)

class SessionNetworkCloudTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        result=subprocess.run(['node','scripts/build-capstone-v3-bootstrap-sql.js'],cwd=ROOT,capture_output=True,timeout=10,check=True)
        cls.bundle=json.loads(result.stdout)

    def test_explicit_rehearsal_and_apply_preserve_frozen_parent(self):
        first,digest,extension=operator.build_sql(self.bundle,'REHEARSAL')
        second,digest2,extension2=operator.build_sql(self.bundle,'ACTIVATE')
        self.assertTrue(first.endswith('ROLLBACK;'))
        self.assertTrue(second.endswith('COMMIT;'))
        self.assertEqual(first[:-len('ROLLBACK;')],second[:-len('COMMIT;')])
        self.assertEqual((digest,extension),(digest2,extension2))
        self.assertIn('SELECT count(*) FROM highpass_v3.deployment_migrations)<>25',first)
        self.assertIn('SET LOCAL ROLE hp_v3_schema_owner;',first)
        self.assertIn("VALUES(26,'032_highpass_v3_exchange_network_audit.sql'",first)
        self.assertNotIn('UPDATE highpass_v3.deployment_migrations',first)
        self.assertNotIn('DELETE FROM',first)

    def test_only_column_insert_and_no_clinical_authority(self):
        sql,_,_=operator.build_sql(self.bundle,'REHEARSAL')
        self.assertIn("noAuditRead",sql)
        self.assertIn("noRecordedAtInsert",sql)
        self.assertIn("pg_advisory_xact_lock",sql)
        grants=[line.strip() for line in sql.splitlines() if line.strip().startswith('GRANT ')]
        self.assertEqual(len(grants),1)
        self.assertTrue(grants[0].startswith('GRANT INSERT('))
        self.assertNotIn('GRANT SELECT',sql)
        self.assertNotIn('SECURITY DEFINER',sql)
        self.assertNotIn('INSERT INTO highpass_v3.exchange_sessions',sql)

    def test_unknown_mode_and_schema_drift_refused(self):
        with self.assertRaises(RuntimeError):
            operator.build_sql(self.bundle,'SKIP')
        with patch.object(pathlib.Path,'read_bytes',return_value=b'unreviewed'):
            with self.assertRaisesRegex(RuntimeError,'CHECKSUM'):
                operator.build_sql(self.bundle,'ACTIVATE')

if __name__=='__main__':
    unittest.main()
