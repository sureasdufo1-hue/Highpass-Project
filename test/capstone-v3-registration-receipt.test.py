import importlib.util
import json
import pathlib
import unittest
from unittest.mock import patch

ROOT=pathlib.Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('receipt',ROOT/'scripts/capstone-v3-mounted-authority-check.py')
operator=importlib.util.module_from_spec(spec);spec.loader.exec_module(operator)


def fixture():
    return dict(schemaVersion=1,scope='CAPSTONE_SYNTHETIC_ONLY',dataset='SYNTHETIC_PHANTOM_24_SLICE_V1',
                tenantId='a1000000-1000-4000-8000-000000000001',hospitalId='a2000000-1000-4000-8000-000000000001',
                registeredBy='a3000000-1000-4000-8000-000000000001',patientRefId='10000000-1000-4000-8000-000000000001',
                mappingId='20000000-1000-4000-8000-000000000001',registrationState='UNVERIFIED_AT_REGISTRATION',initialVersion=1,
                qualifier='POINTER_ONLY_NOT_HUMAN_REVIEW_PATIENT_CONSENT_OR_AUTHORIZATION')


class ReceiptTests(unittest.TestCase):
    def session_fixture(self):
        root='1.2.826.0.1.3680043.10.5432.20261009'
        command=dict(patientRefId='10000000-1000-4000-8000-000000000001',ownerTenantId=fixture()['tenantId'],sourceHospitalId=fixture()['hospitalId'],
                     targetHospitalId='b2000000-1000-4000-8000-000000000001',requesterId=fixture()['registeredBy'],purpose='TREATMENT',
                     initiationType='PROVIDER_INITIATED',validUntil='2026-10-09T02:00:00.000Z',requestedActions=['study:view','study:pacs-transfer'],
                     resources=[{'studyInstanceUid':root+'.'+str(n),'seriesInstanceUids':[root+'.'+str(n)+'.1']} for n in (1,2)])
        return dict(schemaVersion=1,scope='CAPSTONE_SYNTHETIC_ONLY',sessionId='20000000-1000-4000-8000-000000000001',
                    idempotencyKey='30000000-1000-4000-8000-000000000001',command=command,manifestSha256='a'*64,
                    qualifier='REQUESTED_INTENTION_NOT_CONSENT_GRANT_OR_CLINICAL_ACCESS')

    def test_session_receipt_is_intention_only_and_rejects_approval_or_scope_expansion(self):
        value=self.session_fixture()
        self.assertEqual(json.loads(operator.validate_session_receipt(value)),value)
        for changes in ({'scope':'PRODUCTION'},{'qualifier':'CONSENT_APPROVED'},{'sessionId':'bad'},{'rawKey':'FORBIDDEN'}):
            with self.assertRaises(RuntimeError):operator.validate_session_receipt({**value,**changes})
        for changes in ({'resources':[{'studyInstanceUid':'1.2.3'}]},{'requestedActions':['study:download']},
                        {'targetHospitalId':value['command']['sourceHospitalId']},{'validUntil':'2026-02-31T01:00:00.000Z'}):
            with self.assertRaises((RuntimeError,ValueError)):operator.validate_session_receipt({**value,'command':{**value['command'],**changes}})

    def test_session_receipt_never_overwrites_existing_file(self):
        with patch.object(operator.ops,'root_shell',side_effect=RuntimeError('ALREADY_EXISTS')),patch.object(operator.ops,'command') as write:
            with self.assertRaises(RuntimeError):operator.store_session_receipt(object(),'/opt/highpass/example','a'*32,self.session_fixture())
            write.assert_not_called()

    def test_session_audit_uses_operator_aggregates_without_requester_scope_expansion(self):
        value={**self.session_fixture(),'schemaVersion':2,'auditSessionId':'40000000-1000-4000-8000-000000000001'}
        counts=dict(originCreated=1,currentCreated=0,currentRead=3,currentConflict=1,currentRefDenied=1,currentTotal=5)
        with patch.object(operator.ops,'sql',return_value=json.dumps(counts)):
            self.assertEqual(operator.verify_session_audit(object(),value,resumed=True)['status'],'PASS')
        for invalid in ({**counts,'currentTotal':4},{**counts,'originCreated':True}):
            with patch.object(operator.ops,'sql',return_value=json.dumps(invalid)):
                with self.assertRaises(RuntimeError):operator.verify_session_audit(object(),value,resumed=True)

    def candidate(self):
        # Portable boundary fixture: real DICOM bytes are covered by the JS tests.
        return dict(schemaVersion=1,scope='CAPSTONE_SYNTHETIC_ONLY',dataset='SYNTHETIC_PHANTOM_24_SLICE_V1',
                    instanceCount=24,clinicalUseAllowed=False,clinicalAuthorization=False,reviewStatus='PENDING_HUMAN_REVIEW',
                    sourceFreshness='LOCAL_FILES_VERIFIED_LIVE_A_NOT_REVERIFIED',
                    qualifier='METADATA_CANDIDATE_ONLY_NOT_IDENTITY_VERIFICATION_CONSENT_OR_CLINICAL_ACCESS')

    def test_metadata_approval_and_wrong_scope_refused_before_remote_write(self):
        candidate=self.candidate()
        for changes in ({'clinicalAuthorization':True},{'reviewStatus':'PASS'},{'scope':'PRODUCTION'},
                        {'clinicalUseAllowed':True},{'instanceCount':True},{'sourceFreshness':'LIVE_VERIFIED'}):
            with patch.object(operator.ops,'root_shell') as remote,patch.object(operator.ops,'command') as write:
                with self.assertRaisesRegex(RuntimeError,'METADATA_CANDIDATE_NOT_VERIFIED'):
                    operator.store_metadata_review_packet(object(),'/opt/highpass/example',fixture(),{**candidate,**changes})
                remote.assert_not_called();write.assert_not_called()

    def test_changed_metadata_packet_never_overwritten(self):
        with patch.object(operator.ops,'root_shell',side_effect=['','{}']),patch.object(operator.ops,'command') as write:
            with self.assertRaisesRegex(RuntimeError,'METADATA_PACKET_REPLACEMENT_REFUSED'):
                operator.store_metadata_review_packet(object(),'/opt/highpass/example',fixture(),self.candidate())
            write.assert_not_called()

    def test_canonical_pointer_is_not_authorization(self):
        self.assertEqual(json.loads(operator.validate_registration_receipt(fixture())),fixture())

    def test_approved_cross_institution_private_key_or_malformed_pointers_refused(self):
        for changes in ({'scope':'PRODUCTION'},{'registrationState':'VERIFIED'},{'initialVersion':True},
                        {'hospitalId':'b2000000-1000-4000-8000-000000000001'},{'patientRefId':'bad'},
                        {'privateKey':'DO_NOT_STORE'},{'mappingId':fixture()['patientRefId']}):
            with self.assertRaises(RuntimeError):operator.validate_registration_receipt({**fixture(),**changes})

    def test_existing_different_pointer_never_overwritten(self):
        other={**fixture(),'mappingId':'30000000-1000-4000-8000-000000000001'}
        with patch.object(operator.ops,'root_shell',side_effect=['',json.dumps(other)]),patch.object(operator.ops,'command') as write:
            with self.assertRaisesRegex(RuntimeError,'REPLACEMENT_REFUSED'):
                operator.store_registration_receipt(object(),'/opt/highpass/example',fixture())
            write.assert_not_called()


if __name__=='__main__':unittest.main()
