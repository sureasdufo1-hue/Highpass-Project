import importlib.util
import io
import pathlib
import tarfile
import tempfile
import unittest
from datetime import datetime,timedelta,timezone

ROOT=pathlib.Path(__file__).resolve().parents[1]


def load(name,file):
    spec=importlib.util.spec_from_file_location(name,ROOT/'scripts'/file)
    m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m);return m


replica=load('replica_guest','azure-dr-replica.py')
source=load('source_guest','azure-dr-primary-configure.py')
shutdown=load('deadline_guest','azure-dr-self-deallocate.py')


def tar(entries):
    out=io.BytesIO()
    with tarfile.open(fileobj=out,mode='w') as archive:
        for name,body,kind in entries:
            entry=tarfile.TarInfo(name)
            if kind=='symlink':entry.type=tarfile.SYMTYPE;entry.linkname='/outside'
            elif kind=='hardlink':entry.type=tarfile.LNKTYPE;entry.linkname='/outside'
            else:entry.size=len(body)
            archive.addfile(entry,io.BytesIO(body) if kind=='file' else None)
    out.seek(0);return out


class ReplicationGuards(unittest.TestCase):
    def test_normal_data_and_manifest_extract(self):
        stream=tar([('PG_VERSION',b'16\n','file'),('base/1/123',b'data','file'),('backup_manifest',b'{}','file')])
        with tempfile.TemporaryDirectory() as tmp:
            value=replica.extract_stream(stream,tmp)
            self.assertEqual((pathlib.Path(tmp)/'base/1/123').read_bytes(),b'data')
            self.assertEqual(value['excludedPrivateKeyFiles'],[])

    def test_private_key_is_discarded_before_disk_write(self):
        stream=tar([('tls/server.crt',b'public-example','file'),('tls/server.key',b'FAKE-PRIVATE-NOT-A-REAL-KEY','file'),('backup_manifest',b'{}','file')])
        with tempfile.TemporaryDirectory() as tmp:
            value=replica.extract_stream(stream,tmp)
            self.assertEqual(value['excludedPrivateKeyFiles'],['tls/server.key'])
            self.assertFalse((pathlib.Path(tmp)/'tls/server.key').exists())
            self.assertTrue((pathlib.Path(tmp)/'tls/server.crt').exists())

    def test_manifest_after_tar_padding_is_consumed_until_eof(self):
        stream=io.BytesIO(tar([('PG_VERSION',b'16\n','file')]).getvalue()+tar([('backup_manifest',b'{}','file')]).getvalue())
        with tempfile.TemporaryDirectory() as tmp:
            replica.extract_stream(stream,tmp)
            self.assertEqual((pathlib.Path(tmp)/'backup_manifest').read_bytes(),b'{}')
            self.assertEqual(stream.read(),b'')

    def test_other_key_formats_are_private(self):
        for name in ('tls/secret.PEM','tls/store.p12','tls/store.pfx','tls/id_ed25519','tls/id_rsa'):
            with self.subTest(name=name):self.assertTrue(replica.is_private_key(name))

    def test_traversal_absolute_and_windows_paths_rejected(self):
        for name in ('../../outside','/etc/passwd','good/../outside','C:\\outside','\\server\\share'):
            with self.subTest(name=name),tempfile.TemporaryDirectory() as tmp,self.assertRaises(ValueError):
                replica.extract_stream(tar([(name,b'bad','file')]),tmp)

    def test_links_rejected(self):
        for kind in ('symlink','hardlink'):
            with self.subTest(kind=kind),tempfile.TemporaryDirectory() as tmp,self.assertRaises(ValueError):
                replica.extract_stream(tar([('link',b'',kind)]),tmp)

    def test_nonempty_target_never_overwritten(self):
        with tempfile.TemporaryDirectory() as tmp:
            p=pathlib.Path(tmp)/'keep';p.write_text('existing')
            with self.assertRaises(ValueError):replica.extract_stream(tar([('keep',b'new','file')]),tmp)
            self.assertEqual(p.read_text(),'existing')

    def test_size_cap_rejects_overlong_stream(self):
        with tempfile.TemporaryDirectory() as tmp,self.assertRaises(ValueError):
            replica.extract_stream(tar([('file',b'12345','file')]),tmp,max_bytes=4)

    def test_hba_rules_only_apply_to_dedicated_role(self):
        lines=[line for line in source.hba_block('172.18.0.1').decode().splitlines() if not line.startswith('#')]
        self.assertEqual(len(lines),7)
        self.assertEqual(lines[0],'hostssl replication hp_dr_repl_20261016 172.18.0.1/32 scram-sha-256')
        self.assertTrue(all(line.split()[2]=='hp_dr_repl_20261016' for line in lines))
        self.assertTrue(all(line.endswith('reject') for line in lines[1:]))

    def test_hba_public_peer_rejected(self):
        with self.assertRaises(ValueError):source.hba_block('8.8.8.8')

    def test_replication_connection_requires_full_tls_verification(self):
        self.assertIn('sslmode=verify-full',replica.CONN)
        self.assertIn('hostaddr=127.0.0.1',replica.CONN)
        self.assertIn('passfile=/run/dr/replication.pgpass',replica.CONN)
        self.assertNotIn('password=',replica.CONN)

    def test_deallocation_only_after_deadline_on_exact_vm(self):
        self.assertFalse(shutdown.allowed(shutdown.END-timedelta(seconds=1),shutdown.RID))
        self.assertFalse(shutdown.allowed(shutdown.END,'/subscriptions/other/vm/production'))
        self.assertTrue(shutdown.allowed(shutdown.END,shutdown.RID))
        with self.assertRaises(ValueError):shutdown.allowed(datetime(2026,10,20),shutdown.RID)

    def test_deallocation_role_has_no_key_or_other_management_permissions(self):
        import json
        definition=json.loads((ROOT/'infra/azure/dr-self-deallocate-role.json').read_text())
        self.assertEqual(definition['Actions'],['Microsoft.Compute/virtualMachines/deallocate/action'])
        self.assertEqual(definition['DataActions'],[])
        self.assertEqual(len(definition['AssignableScopes']),1)
        timer=(ROOT/'infra/azure/dr-self-deallocate.timer').read_text()
        self.assertIn('OnCalendar=2026-10-20 14:59:00 UTC',timer)
        self.assertIn('Persistent=true',timer)


if __name__=='__main__':unittest.main()
