import importlib.util
import pathlib
import unittest

path = pathlib.Path(__file__).resolve().parents[1] / 'scripts/capstone-v3-credential-material.py'
spec = importlib.util.spec_from_file_location('credentials', path)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class CredentialTests(unittest.TestCase):
    def test_salt_and_password_bound_and_deterministic(self):
        first = module.scram_verifier('a' * 64, b'1' * 16)
        self.assertEqual(first, module.scram_verifier('a' * 64, b'1' * 16))
        self.assertNotEqual(first, module.scram_verifier('b' * 64, b'1' * 16))
        self.assertNotEqual(first, module.scram_verifier('a' * 64, b'2' * 16))
        self.assertNotIn('a' * 64, first)

    def test_invalid_material_refused(self):
        for password in ['', "bad'password", None]:
            with self.assertRaises(ValueError):
                module.scram_verifier(password, b'1' * 16)
        with self.assertRaises(ValueError):
            module.scram_verifier('a' * 64, b'short')

    def test_distinct_fresh_material(self):
        first, second = module.new_material(), module.new_material()
        self.assertEqual(tuple(first), module.ROLES)
        self.assertEqual(len({row['password'] for row in first.values()}), 3)
        for role in first:
            self.assertNotEqual(first[role]['password'], second[role]['password'])


if __name__ == '__main__':
    unittest.main()
