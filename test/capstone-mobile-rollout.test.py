import hashlib
import copy
import importlib.util
import io
import json
import pathlib
import tarfile
import unittest
from unittest.mock import patch

ROOT = pathlib.Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location('mobile_rollout', ROOT / 'scripts/capstone-mobile-b-rollout.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class MobileCandidateAttestation(unittest.TestCase):
    def test_presentation_manifest_requires_shared_assets_and_rejects_unowned_paths(self):
        names = ['public/index.html', 'public/app.js', 'public/ui/workspace.css', 'public/ui/tokens.css', 'public/ui/clinician.js', 'public/ui/patient.js', 'public/mobile/index.html', 'public/mobile/app.js', 'public/mobile/sw.js', 'public/mobile/manifest.json', 'public/brand/mediq-source.png']
        manifest = {'scope': 'PRESENTATION_STATIC_ASSETS_ONLY', 'assets': [{'file': name} for name in names]}
        self.assertEqual(module.presentation_files(manifest), ['src/capstone-b-portal.js'] + names)
        for invalid in [manifest['assets'][1:], manifest['assets'] + [{'file': names[0]}], manifest['assets'] + [{'file': 'public/../secret'}], manifest['assets'] + [{'file': 'public/assets/clinical/image.png'}]]:
            with self.assertRaisesRegex(RuntimeError, 'PRESENTATION_MANIFEST_INVALID'):
                module.presentation_files({**manifest, 'assets': invalid})

    def test_runtime_comparison_ignores_only_env_and_mount_order(self):
        baseline = {'Config': {'Env': ['A=one', 'B=two'], 'User': 'nonroot'}, 'HostConfig': {'Binds': ['/x:/x:ro', '/y:/y:ro'], 'Privileged': False}}
        observed = copy.deepcopy(baseline)
        observed['Config']['Env'].reverse()
        observed['HostConfig']['Binds'].reverse()
        self.assertEqual(module.runtime_differences(baseline, observed), [])
        observed['Config']['Env'][0] = 'B=changed'
        self.assertEqual(module.runtime_differences(baseline, observed), ['ENVIRONMENT_VALUES'])
        observed = copy.deepcopy(baseline)
        observed['HostConfig']['Privileged'] = True
        observed['Config']['User'] = 'root'
        self.assertEqual(module.runtime_differences(baseline, observed), ['Config.User', 'HostConfig.Privileged'])
        observed = copy.deepcopy(baseline)
        observed['Config']['Env'].append('A=duplicate')
        with self.assertRaisesRegex(RuntimeError, 'DUPLICATE_RUNTIME_ENVIRONMENT'):
            module.runtime_differences(baseline, observed)

    def test_only_owned_b_compose_pair_accepts_timestamp_plus(self):
        stage = '/home/server/.highpass-app-2026-10-08T21-31-00.357148+00-00'
        labels = {'com.docker.compose.project': 'hp-capstone-b-portal', 'com.docker.compose.project.working_dir': stage, 'com.docker.compose.project.config_files': stage + '/portal.yml,' + stage + '/encryption.yml'}
        self.assertEqual(module.validated_context(labels), (stage, [stage + '/portal.yml', stage + '/encryption.yml']))
        for path in ['/', '/home/server', stage + '/../other', stage + ';echo unsafe']:
            with self.assertRaises(RuntimeError):
                module.validated_context({**labels, 'com.docker.compose.project.working_dir': path})
        for key, value in [('com.docker.compose.project', 'hp-capstone-a-gateway'), ('com.docker.compose.project.config_files', stage + '/portal.yml,/tmp/encryption.yml')]:
            with self.assertRaises(RuntimeError):
                module.validated_context({**labels, key: value})

    def expected(self):
        return {name: hashlib.sha256((ROOT / name).read_bytes()).hexdigest() for name in module.FILES}

    def test_exact_source_bytes(self):
        with patch.object(module, 'candidate_hashes', return_value=self.expected()):
            self.assertEqual(module.attest_candidate('synthetic-candidate'), self.expected())

    def test_stale_missing_and_extra_assets_are_denied(self):
        expected = self.expected()
        stale = {**expected, module.FILES[0]: '0' * 64}
        missing = {key: value for key, value in expected.items() if key != module.FILES[0]}
        extra = {**expected, 'unexpected-file': '0' * 64}
        for actual in [stale, missing, extra]:
            with self.subTest(actual=actual), patch.object(module, 'candidate_hashes', return_value=actual):
                with self.assertRaisesRegex(RuntimeError, 'CANDIDATE_SOURCE_MISMATCH'):
                    module.attest_candidate('synthetic-candidate')

    def test_copy_failure_removes_only_owned_never_started_container(self):
        container = 'a' * 64
        with patch.object(module, 'local', side_effect=[container, '']) as local, patch.object(module.subprocess, 'run', side_effect=TimeoutError):
            with self.assertRaises(TimeoutError):
                module.candidate_hashes('synthetic-candidate')
        self.assertEqual(local.call_args_list[-1].args[0], ['docker', 'rm', container])
        create = local.call_args_list[0].args[0]
        self.assertEqual(create[:2], ['docker', 'create'])
        self.assertIn('--network=none', create)

    def test_archive_reader_rejects_symlinks_without_extracting(self):
        for symlink in [False, True]:
            stream = io.BytesIO()
            with tarfile.open(fileobj=stream, mode='w') as archive:
                info = tarfile.TarInfo('app.js')
                if symlink:
                    info.type = tarfile.SYMTYPE
                    info.linkname = '/etc/passwd'
                    archive.addfile(info)
                else:
                    info.size = 4
                    archive.addfile(info, io.BytesIO(b'test'))
            if symlink:
                with self.assertRaisesRegex(RuntimeError, 'CANDIDATE_ARCHIVE_INVALID'):
                    module.archived_file_bytes(stream.getvalue())
            else:
                self.assertEqual(module.archived_file_bytes(stream.getvalue()), b'test')


if __name__ == '__main__':
    unittest.main()
