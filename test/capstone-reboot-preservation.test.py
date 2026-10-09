import importlib.util
import pathlib
import unittest

spec = importlib.util.spec_from_file_location("reboot", pathlib.Path(__file__).resolve().parents[1] / "scripts/capstone-vm-reboot-check.py")
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class RebootPreservationTests(unittest.TestCase):
    def test_order_changes_do_not_imply_recreation(self):
        first = {"name": "a", "containerId": "id-a", "imageId": "image-a", "restart": "unless-stopped", "mountFingerprint": "mount-a"}
        second = {**first, "name": "b", "containerId": "id-b"}
        self.assertTrue(module.unchanged([first, second], [second, first]))

    def test_recreated_container_or_changed_mount_is_not_preserved(self):
        row = {"name": "a", "containerId": "id-a", "imageId": "image-a", "restart": "unless-stopped", "mountFingerprint": "mount-a"}
        for field in ["containerId", "imageId", "mountFingerprint", "restart"]:
            self.assertFalse(module.unchanged([row], [{**row, field: "changed"}]))
        self.assertFalse(module.unchanged([row], []))


if __name__ == "__main__":
    unittest.main()
