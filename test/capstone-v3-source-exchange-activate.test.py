import importlib.util
import pathlib
import unittest

ROOT=pathlib.Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('activation',ROOT/'scripts/capstone-v3-source-exchange-activate.py')
operator=importlib.util.module_from_spec(spec);spec.loader.exec_module(operator)

class ActivationTests(unittest.TestCase):
 def test_remote_program_parses_without_execution(self):
  compile(operator.REMOTE,'remote-profile-activation','exec')
 def test_staging_precedes_sql_and_original_directory_is_not_overwritten(self):
  text=operator.REMOTE
  self.assertLess(text.index("new.mkdir(mode=0o700)"),text.index("rows=[json.loads(line) for line in sql(p['sql'])"))
  self.assertIn("registry.open('x')",text)
  self.assertIn("directory_matches(p['baseline'])",text)
  self.assertIn("directory_matches(p['next'])",text)
  self.assertIn("SQL_ATTEMPTED_RECONCILIATION_REQUIRED",text)
  self.assertIn("keysCopiedWithinCloudOnly=True",text)
  self.assertNotIn('r.stderr.decode',text)
 def test_pinned_operator_has_explicit_activation_and_no_private_key_export(self):
  text=(ROOT/'scripts/capstone-v3-source-exchange-activate.py').read_text()
  self.assertIn('paramiko.RejectPolicy()',text)
  self.assertIn('if not args.activate',text)
  self.assertNotIn('AutoAddPolicy',text)
  self.assertNotIn('sftp.get(',text)
  self.assertNotIn('shutil.rmtree',text)

if __name__=='__main__':unittest.main()
