import importlib.util
import pathlib
import unittest
from datetime import datetime, timedelta, timezone
from cryptography import x509
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.asymmetric import rsa
from cryptography.x509.oid import NameOID, ExtendedKeyUsageOID
import ipaddress

ROOT=pathlib.Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('identity_tls',ROOT/'scripts/capstone-v3-identity-tls-prepare.py')
operator=importlib.util.module_from_spec(spec);spec.loader.exec_module(operator)


class CertificateTests(unittest.TestCase):
    def fixture(self,role='api-server',days=30,wrong_san=False,wrong_eku=False):
        now=datetime.now(timezone.utc).replace(microsecond=0)-timedelta(seconds=1)
        key=rsa.generate_private_key(public_exponent=65537,key_size=2048)
        ca_key=rsa.generate_private_key(public_exponent=65537,key_size=2048)
        name=x509.Name([x509.NameAttribute(NameOID.COMMON_NAME,'SYNTHETIC TEST CA')])
        ca=x509.CertificateBuilder().subject_name(name).issuer_name(name).public_key(ca_key.public_key()).serial_number(1).not_valid_before(now).not_valid_after(now+timedelta(days=60)).add_extension(x509.BasicConstraints(ca=True,path_length=0),critical=True).sign(ca_key,hashes.SHA256())
        subject=x509.Name([x509.NameAttribute(NameOID.COMMON_NAME,'SYNTHETIC TEST LEAF')])
        csr=x509.CertificateSigningRequestBuilder().subject_name(subject).sign(key,hashes.SHA256())
        san=[x509.DNSName('localhost'),x509.IPAddress(ipaddress.ip_address('127.0.0.1'))] if role=='api-server' else [x509.UniformResourceIdentifier('spiffe://highpass.local/dev/identity-edge-proxy')]
        eku=ExtendedKeyUsageOID.SERVER_AUTH if role=='api-server' else ExtendedKeyUsageOID.CLIENT_AUTH
        if wrong_san:san=[x509.DNSName('foreign.invalid')]
        if wrong_eku:eku=ExtendedKeyUsageOID.CLIENT_AUTH if role=='api-server' else ExtendedKeyUsageOID.SERVER_AUTH
        cert=x509.CertificateBuilder().subject_name(subject).issuer_name(name).public_key(key.public_key()).serial_number(2).not_valid_before(now).not_valid_after(now+timedelta(days=days)).add_extension(x509.BasicConstraints(ca=False,path_length=None),critical=True).add_extension(x509.SubjectAlternativeName(san),critical=False).add_extension(x509.ExtendedKeyUsage([eku]),critical=False).sign(ca_key,hashes.SHA256())
        return cert,csr,ca

    def test_separate_api_and_client_profiles(self):
        for role in ('api-server','proxy-client'):
            self.assertTrue(operator.check_public_certificate(*self.fixture(role),role))

    def test_wrong_scope_role_and_excessive_lifetime_rejected(self):
        for patch in ({'days':31},{'wrong_san':True},{'wrong_eku':True}):
            with self.assertRaises(RuntimeError):operator.check_public_certificate(*self.fixture(**patch),'api-server')

    def test_other_key_csr_rejected(self):
        cert,_,ca=self.fixture();_,csr,_=self.fixture()
        with self.assertRaises(RuntimeError):operator.check_public_certificate(cert,csr,ca,'api-server')


if __name__=='__main__':unittest.main()
