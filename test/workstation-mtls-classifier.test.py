"""Pure classifier tests; no VMware, SSH, Docker, network or credentials needed."""
import importlib.util
import json
import pathlib
import unittest

source = pathlib.Path(__file__).resolve().parents[1] / "scripts/workstation-automatic-ops.py"
spec = importlib.util.spec_from_file_location("workstation_ops", source)
ops = importlib.util.module_from_spec(spec)
spec.loader.exec_module(ops)


class ClassifierTests(unittest.TestCase):
    def test_success_requires_exit_zero_and_http_200(self):
        self.assertEqual(ops.classify_mtls(0, '{"statusCode":200}', ""), "ALLOW")
        self.assertEqual(ops.classify_mtls(1, '{"statusCode":200}', ""), "ENVIRONMENT_ERROR")

    def test_infrastructure_errors_are_not_denials(self):
        for error in ["ENOTFOUND", "ECONNREFUSED", "ETIMEDOUT", "ECONNRESET", "ENOENT"]:
            self.assertEqual(ops.classify_mtls(1, json.dumps({"error": error}), ""), "ENVIRONMENT_ERROR")

    def test_explicit_certificate_rejection_and_policy_403(self):
        for error in ["ERR_SSL_TLSV13_ALERT_CERTIFICATE_REQUIRED", "CERT_HAS_EXPIRED", "SELF_SIGNED_CERT_IN_CHAIN"]:
            self.assertEqual(ops.classify_mtls(1, json.dumps({"error": error}), ""), "DENY")
        self.assertEqual(ops.classify_mtls(2, '{"statusCode":403}', ""), "DENY")

    def test_reset_requires_matching_server_connection_and_certificate_reason(self):
        client = json.dumps({"error": "ECONNRESET", "localAddress": "172.20.0.4", "localPort": 45000})
        proof = {"event": "TLS_CLIENT_REJECTED", "code": "CERT_HAS_EXPIRED", "remoteAddress": "::ffff:172.20.0.4", "remotePort": 45000}
        self.assertEqual(ops.classify_mtls(1, client, json.dumps(proof)), "DENY")
        for key, bad in [("remotePort", 45001), ("remoteAddress", "172.20.0.5"), ("code", "ETIMEDOUT"), ("event", "OTHER_EVENT")]:
            self.assertEqual(ops.classify_mtls(1, client, json.dumps({**proof, key: bad})), "ENVIRONMENT_ERROR")


if __name__ == "__main__":
    unittest.main()
