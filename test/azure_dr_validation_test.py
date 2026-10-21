import copy
import importlib.util
import pathlib
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('dr_validation', ROOT/'scripts/azure-dr-validation.py')
lab = importlib.util.module_from_spec(spec)
spec.loader.exec_module(lab)


class ValidationLabTests(unittest.TestCase):
    def test_exact_disabled_template(self):
        self.assertTrue(lab.validate_template(lab.read_template()))

    def test_added_resource_or_active_route_rejected(self):
        template = lab.read_template()
        mutations = [
            lambda t: t['resources'].append(copy.deepcopy(t['resources'][0])),
            lambda t: t['resources'][0]['properties'].update(profileStatus='Enabled'),
            lambda t: t['resources'][0]['properties']['endpoints'][0]['properties'].update(endpointStatus='Enabled'),
            lambda t: t['resources'][0]['properties']['endpoints'][0]['properties'].update(alwaysServe='Enabled'),
            lambda t: t['resources'][0]['properties'].update(trafficViewEnrollmentStatus='Enabled'),
            lambda t: t['resources'][0]['properties']['endpoints'][0]['properties'].update(target='unapproved.example.com'),
            lambda t: t['resources'][0].update(name='production'),
            lambda t: t['resources'][0].update(dependsOn=['production']),
            lambda t: t.update(parameters={'danger': {'type': 'string'}}),
        ]
        for index, mutate in enumerate(mutations):
            changed = copy.deepcopy(template)
            mutate(changed)
            with self.subTest(index=index), self.assertRaises(ValueError):
                lab.validate_template(changed)

    def test_what_if_only_exact_new_profile(self):
        expected = {'status': 'Succeeded', 'changes': [{'changeType': 'Create', 'resourceId': lab.RID}]}
        self.assertTrue(lab.check_what_if(expected))
        for change in ('Modify', 'Delete', 'NoChange', 'Ignore'):
            modified = copy.deepcopy(expected)
            modified['changes'][0]['changeType'] = change
            with self.subTest(change=change), self.assertRaises(ValueError):lab.check_what_if(modified)
        for value in ({'status':'Failed','changes':expected['changes']},
                      {'status':'Succeeded','changes':[]},
                      {'status':'Succeeded','changes':[{'changeType':'Create','resourceId':'/unapproved'}]},
                      {'status':'Succeeded','changes':expected['changes']*2}):
            with self.assertRaises(ValueError):lab.check_what_if(value)

    def live(self):
        resource = copy.deepcopy(lab.read_template()['resources'][0])
        resource['id'] = lab.RID
        resource['properties']['dnsConfig']['fqdn'] = lab.FQDN
        return resource

    def test_live_profile_is_disabled_and_expected(self):
        self.assertTrue(lab.verify_profile(self.live()))

    def test_live_activation_or_missing_endpoint_rejected(self):
        for key in ('profileStatus', 'trafficRoutingMethod', 'trafficViewEnrollmentStatus'):
            value = self.live()
            value['properties'][key] = 'UNEXPECTED'
            with self.subTest(key=key), self.assertRaises(ValueError):lab.verify_profile(value)
        for field in ('endpointStatus', 'alwaysServe', 'target', 'priority'):
            value = self.live()
            value['properties']['endpoints'][0]['properties'][field] = 'UNEXPECTED'
            with self.subTest(field=field), self.assertRaises(ValueError):lab.verify_profile(value)
        value = self.live();value['properties']['endpoints'] = []
        with self.assertRaises(ValueError):lab.verify_profile(value)


if __name__ == '__main__':unittest.main()
