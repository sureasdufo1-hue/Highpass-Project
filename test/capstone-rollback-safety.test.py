import importlib.util
import pathlib
import unittest

ROOT = pathlib.Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location("rollback_check", ROOT / "scripts/capstone-a-rollback-check.py")
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class RollbackSafety(unittest.TestCase):
    def test_context_is_exact_owned_compose_pair(self):
        stage = "/home/server/.highpass-app-2026-10-08T19-40-56.049509+00-00"
        labels = {"com.docker.compose.project.working_dir": stage,
                  "com.docker.compose.project.config_files": stage + "/gateway.yml," + stage + "/encryption.yml"}
        self.assertEqual(module.validated_context(labels), (stage, [stage + "/gateway.yml", stage + "/encryption.yml"]))
        for bad in ["/", "/home/server", stage + ";echo unsafe", stage + "/../other"]:
            with self.assertRaisesRegex(RuntimeError, "CONTEXT_PATH_INVALID"):
                module.validated_context({**labels, "com.docker.compose.project.working_dir": bad})
        with self.assertRaisesRegex(RuntimeError, "CONTEXT_FILES_INVALID"):
            module.validated_context({**labels, "com.docker.compose.project.config_files": stage + "/gateway.yml,/tmp/unrelated.yml"})

    def test_command_keeps_scoped_project_and_required_encryption(self):
        stage = "/home/server/.highpass-app-2026-10-08T19-40-56.049509+00-00"
        command = module.compose_command(stage, [stage + "/gateway.yml", stage + "/encryption.yml"], module.OLD)
        self.assertIn("-p hp-capstone-a-gateway", command)
        self.assertIn("/encryption.yml", command)
        self.assertIn(module.previous.KEY_ID, command)
        for forbidden in [" down", "--volumes", "prune", "rm ", "--insecure", "verify=false"]:
            self.assertNotIn(forbidden, command)


if __name__ == "__main__":
    unittest.main()
