import importlib.util
import pathlib
import subprocess
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('mounted_qa', ROOT / 'scripts/capstone-v3-mounted-authority-check.py')
operator = importlib.util.module_from_spec(spec)
spec.loader.exec_module(operator)


class ReadinessQaTests(unittest.TestCase):
    def test_session_program_uses_real_services_and_strips_private_receipt_from_public_evidence(self):
        spec=importlib.util.spec_from_file_location('session_program',ROOT/'scripts/capstone-v3-runtime-qa-program.py')
        runtime=importlib.util.module_from_spec(spec);spec.loader.exec_module(runtime)
        program=runtime.session_program({'resources':[],'manifestSha256':'a'*64,'clinicalAuthorization':False})
        completed=subprocess.run(['node','--input-type=module','--check'],input=program,text=True,capture_output=True,timeout=10,cwd=ROOT)
        self.assertEqual(completed.returncode,0,completed.stderr)
        self.assertIn('await sessions.create(source,sessionKey,command',program)
        self.assertIn('V3_SESSION_IDEMPOTENCY_CONFLICT',program)
        self.assertIn('QA_SESSION_B_RLS_NOT_DENIED',program)
        self.assertIn("sessionHttp:'NOT VERIFIED'",program)
        self.assertIn('sessions.dispose()',program)
        files=operator.source_files(runtime=True,mapping=True,session=True)
        self.assertIn('v3-exchange-session-service.js',files)
        self.assertIn('v3-exchange-read-service.js',files)
        self.assertLessEqual(len(files),40)
    def test_default_preserves_single_role_authority_qa(self):
        self.assertEqual(operator.qa_program(), operator.PROGRAM)
        self.assertNotIn('v3-identity-readiness.js', operator.source_files())

    def test_three_pool_diagnostic_uses_actual_service_and_fresh_bindings(self):
        program = operator.qa_program(True)
        self.assertIn('await readiness.check(binding)', program)
        self.assertIn('VERIFIED_MAPPING_BINDING_REQUIRED', program)
        self.assertIn('hp_v3_identity_preauth_writer', program)
        self.assertIn('hp_v3_identity_preauth_reader', program)
        self.assertIn('readiness.dispose()', program)
        self.assertIn('publisherPool.end()', program)
        self.assertNotIn('createV3IdentityCapstoneRuntime', program)
        files = operator.source_files(True)
        self.assertIn('v3-identity-readiness.js', files)
        self.assertIn('v3-tenant-transaction.js', files)
        self.assertLessEqual(len(files), 40)

    def test_both_embedded_programs_parse_without_remote_execution(self):
        for enabled in (False, True):
            completed = subprocess.run(['node', '--input-type=module', '--check'], input=operator.qa_program(enabled),
                                       text=True, capture_output=True, timeout=10, cwd=ROOT)
            self.assertEqual(completed.returncode, 0, completed.stderr)

    def test_runtime_qa_uses_real_service_and_explicit_tls_errors(self):
        spec=importlib.util.spec_from_file_location('runtime_program',ROOT/'scripts/capstone-v3-runtime-qa-program.py')
        runtime=importlib.util.module_from_spec(spec);spec.loader.exec_module(runtime)
        program=runtime.PROGRAM
        self.assertIn('await startCapstoneMountedIdentityService',program)
        self.assertIn('rejectUnauthorized:true',program)
        self.assertIn('ERR_SSL_TLSV13_ALERT_CERTIFICATE_REQUIRED',program)
        self.assertIn('ERR_TLS_CERT_ALTNAME_INVALID',program)
        self.assertNotIn("'ECONNRESET'",program)
        self.assertIn('await service?.stop()',program)
        self.assertIn("clinicalHttpFlow:'NOT VERIFIED'",program)
        self.assertIn('createV3IdentityCapstoneProxy',program)
        self.assertIn('JOIN highpass_v3.identity_network_audit',program)
        self.assertIn('await service.stop()',program)
        self.assertIn('afterStop.has(id)',program)
        self.assertIn("row[0].source_ip!=='127.0.0.1'",program)
        completed=subprocess.run(['node','--input-type=module','--check'],input=program,text=True,capture_output=True,timeout=10,cwd=ROOT)
        self.assertEqual(completed.returncode,0,completed.stderr)
        files=operator.source_files(runtime=True)
        self.assertIn('v3-capstone-mounted-service.js',files)
        self.assertIn('v3-identity-capstone-host.js',files)

    def test_mapping_phase_is_explicit_idempotent_and_never_reviews(self):
        spec=importlib.util.spec_from_file_location('mapping_program',ROOT/'scripts/capstone-v3-runtime-qa-program.py')
        runtime=importlib.util.module_from_spec(spec);spec.loader.exec_module(runtime)
        program=runtime.mapping_program()
        self.assertIn('registerIdempotent',program)
        self.assertIn("stateAfterDenial:'UNVERIFIED'",program)
        self.assertIn("humanReview:'NOT PERFORMED'",program)
        self.assertIn('QA_REQUESTER_REVIEW_NOT_DENIED',program)
        self.assertIn('QA_FOREIGN_MAPPING_NOT_DENIED',program)
        self.assertNotIn('V3PatientRefService',runtime.PROGRAM)
        completed=subprocess.run(['node','--input-type=module','--check'],input=program,text=True,capture_output=True,timeout=10,cwd=ROOT)
        self.assertEqual(completed.returncode,0,completed.stderr)
        self.assertIn('v3-patient-ref-service.js',operator.source_files(runtime=True,mapping=True))


if __name__ == '__main__':
    unittest.main()
