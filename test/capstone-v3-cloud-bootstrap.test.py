import importlib.util
import pathlib
import subprocess
import sys
import unittest
import hashlib
import json

ROOT = pathlib.Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location('bootstrap', ROOT / 'scripts/capstone-v3-cloud-bootstrap.py')
bootstrap = importlib.util.module_from_spec(spec)
spec.loader.exec_module(bootstrap)


class BootstrapTests(unittest.TestCase):
    def digest(self, value):
        return subprocess.run([sys.executable, '-c', bootstrap.CANON], input=value,
                              capture_output=True, timeout=5)

    def test_copy_rows_preserved_even_when_they_look_like_metadata(self):
        body = b'COPY public.synthetic (value) FROM stdin;\n--SYNTHETIC_ROW\nSET SYNTHETIC_ROW\n\\.\n'
        result = self.digest(b'-- pg_dump metadata\nSET client_encoding = \'UTF8\';\n' + body + b'-- tail\n')
        self.assertEqual(result.returncode, 0)
        diagnostic = subprocess.run([sys.executable, '-c', bootstrap.CANON, '--diagnostic'],input=body,capture_output=True,timeout=5)
        facts=json.loads(diagnostic.stdout)
        self.assertEqual(facts['orderedDataSha256'], hashlib.sha256(body).hexdigest())
        self.assertEqual(result.stdout.strip().decode(),facts['canonicalDataSha256'])
        altered = self.digest(body.replace(b'--SYNTHETIC_ROW', b'--DIFFERENT_SYNTHETIC_ROW'))
        self.assertNotEqual(result.stdout, altered.stdout)

    def test_sequence_state_preserved_and_unknown_or_incomplete_data_rejected(self):
        body = b"SELECT pg_catalog.setval('public.synthetic_seq', 7, true);\n"
        result = self.digest(body)
        self.assertEqual(result.returncode, 0)
        diagnostic=subprocess.run([sys.executable,'-c',bootstrap.CANON,'--diagnostic'],input=body,capture_output=True,timeout=5)
        self.assertEqual(json.loads(diagnostic.stdout)['orderedDataSha256'], hashlib.sha256(body).hexdigest())
        for value in [b'COPY public.synthetic (value) FROM stdin;\nUNFINISHED\n', b'DROP TABLE public.synthetic;\n']:
            self.assertNotEqual(self.digest(value).returncode, 0)

    def test_large_single_line_rejected_by_finite_limit(self):
        self.assertNotEqual(self.digest(b'x' * (2*1024*1024+1)).returncode, 0)

    def test_restore_cleanup_names_cannot_target_original_or_new_v3_database(self):
        for name in ['hipass', 'postgres', bootstrap.TARGET, 'highpass_v3_backup_check_../escape', 'highpass_v3_backup_check_ABCDEF123456']:
            with self.assertRaises(RuntimeError):
                bootstrap.restore_name(name)
        self.assertEqual(bootstrap.restore_name('highpass_v3_backup_check_abcdef123456'), 'highpass_v3_backup_check_abcdef123456')

    def test_physical_table_row_order_ignored_but_duplicates_columns_and_values_preserved(self):
        a=b'COPY public.a (value) FROM stdin;\nA\nB\nA\n\\.\n'
        reordered=b'COPY public.a (value) FROM stdin;\nB\nA\nA\n\\.\n'
        b=b'COPY public.b (value) FROM stdin;\nC\n\\.\n'
        self.assertEqual(self.digest(a+b).stdout,self.digest(b+reordered).stdout)
        for changed in [a.replace(b'A\nB\nA',b'A\nB'),a.replace(b'A\nB\nA',b'A\nB\nD'),a.replace(b'(value)',b'(different)')]:
            self.assertNotEqual(self.digest(a+b).stdout,self.digest(changed+b).stdout)
        self.assertNotEqual(self.digest(a+a).returncode,0)


if __name__ == '__main__':
    unittest.main()
