import importlib.util
import pathlib
import unittest

ROOT=pathlib.Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('tls_operator',ROOT/'scripts/capstone-v3-db-tls-apply.py')
operator=importlib.util.module_from_spec(spec);spec.loader.exec_module(operator)


class HbaTests(unittest.TestCase):
    def test_owned_private_network_and_three_roles_only(self):
        rules=operator.tls_hba('a'*32,'172.21.0.0/16').splitlines()[1:]
        self.assertEqual(len(rules),7)
        for rule in rules:
            self.assertIn(operator.ROLES,rule)
            self.assertNotIn('trust',rule)
        self.assertIn('172.21.0.0/16 scram-sha-256',rules[3])
        self.assertTrue(rules[4].startswith('hostnossl '))
        self.assertTrue(rules[4].endswith('all reject'))
        self.assertTrue(rules[-1].endswith('all reject'))

    def test_wide_public_loopback_and_noncanonical_networks_refused(self):
        for subnet in ['0.0.0.0/0','138.91.0.0/16','127.0.0.0/16','172.21.1.1/16','172.16.0.0/12','::/0','10.0.0.0/32']:
            with self.assertRaises(ValueError):
                operator.tls_hba('a'*32,subnet)

    def test_operation_cannot_inject_rules_paths(self):
        for operation in ['a'*31,'../other','a'*32+'\ntrust']:
            with self.assertRaises(ValueError):
                operator.tls_hba(operation,'172.21.0.0/16')


if __name__=='__main__':unittest.main()
