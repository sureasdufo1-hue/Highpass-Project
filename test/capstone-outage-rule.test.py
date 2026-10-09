import importlib.util
import pathlib
import unittest

spec = importlib.util.spec_from_file_location("outage", pathlib.Path(__file__).resolve().parents[1] / "scripts/capstone-browser-outage-check.py")
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class RuleTests(unittest.TestCase):
    def test_one_container_one_destination_port_and_exact_comment(self):
        rule = module.exact_rule("172.18.0.2", "10.89.1.4", "hp-cap-outage-fixture-1")
        self.assertIn("-s 172.18.0.2/32 -d 10.89.1.4/32", rule)
        self.assertIn("--dport 443", rule)
        self.assertIn("--comment hp-cap-outage-fixture-1", rule)
        self.assertNotIn("ACCEPT", rule)

    def test_arbitrary_destinations_and_shell_comments_are_rejected(self):
        with self.assertRaises(RuntimeError):
            module.exact_rule("172.18.0.2", "8.8.8.8", "hp-cap-outage-fixture-1")
        with self.assertRaises(RuntimeError):
            module.exact_rule("172.18.0.2", "10.89.1.4", "hp-cap-outage-fixture;bad")


if __name__ == "__main__":
    unittest.main()
