import importlib.util
import pathlib
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[1]


def load(name, file):
    spec = importlib.util.spec_from_file_location(name, ROOT / 'scripts' / file)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


enroll = load('enrollment', 'capstone-v3-cloud-identity-enroll.py')
boundary = load('boundary', 'capstone-v3-auth-boundary-check.py')


class OperatorTests(unittest.TestCase):
    def test_both_remote_programs_compile(self):
        compile(enroll.REMOTE, '<remote-enroll>', 'exec')
        compile(enroll.AUTH_REMOTE, '<remote-auth>', 'exec')

    def test_verify_does_not_replay_creation_or_grants(self):
        self.assertNotIn('CREATE ROLE', enroll.AUTH_REMOTE)
        self.assertNotIn('GRANT ', enroll.AUTH_REMOTE)
        self.assertIn('PASSWORD_AUTHENTICATION_NOT_ENFORCED', enroll.AUTH_REMOTE)
        self.assertIn('temporaryPassfilesRemoved=True', enroll.AUTH_REMOTE)

    def test_hba_prefix_only_exact_three_roles(self):
        text = boundary.v3_prefix('a' * 32)
        rules = text.splitlines()[1:]
        self.assertEqual(len(rules), 6)
        self.assertNotIn('trust', text)
        self.assertNotIn('hipass_app', text)
        self.assertNotIn('hipass_bootstrap', text)
        for rule in rules:
            self.assertIn(boundary.ROLES, rule)
        self.assertTrue(rules[-1].endswith('all reject'))

    def test_hba_operation_cannot_inject_paths_or_rules(self):
        for operation in ['../other', 'a' * 31, 'x' * 32, 'a' * 32 + '\ntrust']:
            with self.assertRaises(ValueError):
                boundary.v3_prefix(operation)


if __name__ == '__main__':
    unittest.main()
