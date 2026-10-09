import copy
import importlib.util
import pathlib
import unittest

ROOT = pathlib.Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location('cloud_rollout', ROOT / 'scripts/capstone-cloud-app-rollout.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class PhantomRolloutContract(unittest.TestCase):
    def fixture(self):
        baseline = {'services': {name: {'image': 'old', 'environment': {'AUTH_MODE': 'TEST'},
                    'volumes': ['/owned:/run/secrets:ro']} for name in
                    ['control', 'ingress', 'bootstrap', 'key-release-migrate']},
                    'networks': {'private': {'internal': True}}}
        candidate = copy.deepcopy(baseline)
        for service in candidate['services'].values():
            service['image'] = 'new'
        candidate['services']['control']['environment'][module.PHANTOM_FLAG] = '1'
        return baseline, candidate

    def test_opt_in_only_and_default_image_only_still_rejects_it(self):
        baseline, candidate = self.fixture()
        module.assert_phantom_config(baseline, candidate, 'old', 'new')
        with self.assertRaisesRegex(RuntimeError, 'NON_IMAGE_COMPOSE_CHANGE'):
            module.assert_image_only_config(baseline, candidate, 'old', 'new')
        self.assertNotIn(module.PHANTOM_FLAG, baseline['services']['control']['environment'])

    def test_unrelated_changes_and_non_exact_activation_rejected(self):
        for mutate in [lambda c: c['services']['ingress']['environment'].update({module.PHANTOM_FLAG: '1'}),
                       lambda c: c['services']['control']['environment'].update({'AUTH_MODE': 'DEVELOPMENT_MOCK'}),
                       lambda c: c['services']['control'].update({'ports': ['3000:3000']}),
                       lambda c: c['services']['control'].update({'volumes': []}),
                       lambda c: c['networks']['private'].update({'internal': False}),
                       lambda c: c['services']['control']['environment'].update({module.PHANTOM_FLAG: 1}),
                       lambda c: c['services']['control']['environment'].update({module.PHANTOM_FLAG: '0'})]:
            baseline, candidate = self.fixture()
            mutate(candidate)
            with self.assertRaises(RuntimeError):
                module.assert_phantom_config(baseline, candidate, 'old', 'new')

    def test_owned_context_accepts_only_exact_optional_overlay(self):
        stage = '/home/highpassadmin/.highpass-app-2026-10-09T07-00-00.000000+00-00'
        paths = [stage + '/' + name for _, name in module.FILES]
        labels = {'com.docker.compose.project': 'hp-capstone-control',
                  'com.docker.compose.project.working_dir': stage,
                  'com.docker.compose.project.config_files': ','.join(paths)}
        self.assertEqual(module.validated_context(labels)[1], paths)
        overlay = stage + '/' + module.PHANTOM_OVERLAY
        self.assertEqual(module.validated_context({**labels, 'com.docker.compose.project.config_files': ','.join(paths + [overlay])})[1], paths + [overlay])
        for wrong in ['/tmp/phantom-catalog.yml', overlay + ',other', stage + '/other.yml']:
            with self.assertRaises(RuntimeError):
                module.validated_context({**labels, 'com.docker.compose.project.config_files': ','.join(paths + [wrong])})

    def test_runtime_opt_in_and_exact_rollback_are_distinct(self):
        before = {'Config': {'Env': ['AUTH_MODE=TEST']}, 'HostConfig': {}}
        after = copy.deepcopy(before)
        after['Config']['Env'].append(module.PHANTOM_FLAG + '=1')
        self.assertEqual(module.runtime_differences(before, after, True), [])
        self.assertIn('ENVIRONMENT_VALUES', module.runtime_differences(before, after))
        self.assertEqual(module.runtime_differences(before, before), [])
        after['HostConfig']['Privileged'] = True
        self.assertIn('HostConfig.Privileged', module.runtime_differences(before, after, True))


if __name__ == '__main__':
    unittest.main()
