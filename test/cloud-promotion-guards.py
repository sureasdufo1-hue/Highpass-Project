"""Pure deployment guard tests: no network or Docker mutation."""
import importlib.util
import pathlib
import unittest
import copy

root = pathlib.Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location("promotion", root / "scripts/capstone-cloud-app-rollout.py")
promotion = importlib.util.module_from_spec(spec)
spec.loader.exec_module(promotion)

class Guards(unittest.TestCase):
    def test_image_only_config(self):
        baseline = {"services": {name: {"image": "old", "environment": {"MODE": "strict"}}
                     for name in ["control", "ingress", "bootstrap", "key-release-migrate"]}}
        baseline["services"]["postgres"] = {"image": "pg"}
        candidate = copy.deepcopy(baseline)
        for name in ["control", "ingress", "bootstrap", "key-release-migrate"]:
            candidate["services"][name]["image"] = "new"
        original = copy.deepcopy(candidate)
        promotion.assert_image_only_config(baseline, candidate, "old", "new")
        self.assertEqual(candidate, original)
        for name in ["control", "postgres"]:
            drift = copy.deepcopy(candidate)
            drift["services"][name]["image"] = "unexpected"
            with self.assertRaises(RuntimeError):
                promotion.assert_image_only_config(baseline, drift, "old", "new")
        candidate["services"]["control"]["environment"]["MODE"] = "weak"
        with self.assertRaises(RuntimeError):
            promotion.assert_image_only_config(baseline, candidate, "old", "new")

    def test_context(self):
        stage = "/home/highpassadmin/.highpass-app-2026-10-08T19-03-15.237525+00-00"
        labels = {"com.docker.compose.project": "hp-capstone-control", "com.docker.compose.project.working_dir": stage,
                  "com.docker.compose.project.config_files": ",".join(stage + "/" + name for _, name in promotion.FILES)}
        self.assertEqual(promotion.validated_context(labels)[0], stage)
        for key, value in [("com.docker.compose.project", "other"), ("com.docker.compose.project.working_dir", "/tmp/untrusted"),
                           ("com.docker.compose.project.config_files", stage + "/../../evil.yml")]:
            with self.assertRaises(RuntimeError):
                promotion.validated_context({**labels, key: value})

    def test_runtime(self):
        original = {"Config": {"Env": ["A=one", "B=two"], "Cmd": ["control"], "User": "nonroot"},
                    "HostConfig": {"Binds": ["/a:/b:ro"], "ReadonlyRootfs": True}}
        reordered = copy.deepcopy(original)
        reordered["Config"]["Env"].reverse()
        self.assertEqual(promotion.runtime_differences(original, reordered), [])
        for group, key, value in [("Config", "Env", ["A=changed", "B=two"]), ("Config", "User", "root"),
                                  ("HostConfig", "ReadonlyRootfs", False), ("HostConfig", "Binds", [])]:
            changed = copy.deepcopy(original)
            changed[group][key] = value
            self.assertTrue(promotion.runtime_differences(original, changed))
        changed = copy.deepcopy(original)
        changed["Config"]["Env"] = ["A=one", "A=two"]
        with self.assertRaises(RuntimeError):
            promotion.runtime_differences(original, changed)

if __name__ == "__main__":
    unittest.main()
