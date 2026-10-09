import importlib.util
import json
import pathlib
import unittest

spec = importlib.util.spec_from_file_location("autostart", pathlib.Path(__file__).resolve().parents[1] / "scripts/capstone-vm-autostart-check.py")
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class InventoryTests(unittest.TestCase):
    def test_filtered_inventory_never_contains_environment_or_mount_contents(self):
        values = ["/owned", "container", "image", "unless-stopped", True,
                  {"com.docker.compose.project": "hp-capstone-a-gateway"},
                  [{"Source": "/root-protected/key", "Destination": "/run/key"}],
                  {"Status": "healthy", "Log": [{"Output": "not exported"}]}]
        row = module.parse_inventory("|".join(json.dumps(value) for value in values))[0]
        self.assertEqual(row["health"], "healthy")
        self.assertEqual(len(row["mountFingerprint"]), 64)
        self.assertNotIn("not exported", json.dumps(row))
        self.assertNotIn("/root-protected/key", json.dumps(row))

    def test_unstructured_inventory_fails_closed(self):
        with self.assertRaisesRegex(RuntimeError, "FILTERED_INVENTORY_INVALID"):
            module.parse_inventory("unexpected raw output")


if __name__ == "__main__":
    unittest.main()
