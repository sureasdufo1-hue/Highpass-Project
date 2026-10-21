import copy
import importlib.util
import json
import pathlib
import unittest

ROOT=pathlib.Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('standby',ROOT/'scripts/azure-dr-standby.py')
dr=importlib.util.module_from_spec(spec);spec.loader.exec_module(dr)


class StandbyTests(unittest.TestCase):
    def template(self):return json.loads(dr.TEMPLATE.read_text())

    def test_exact_template(self):self.assertTrue(dr.validate_template(self.template()))

    def test_broad_sources_rejected(self):
        dr.validate_sources('112.76.111.121/32','138.91.2.60/32')
        for value in ('0.0.0.0/0','112.76.111.0/24','127.0.0.1/32','10.1.1.1/32','::/0'):
            with self.subTest(value=value),self.assertRaises(ValueError):dr.validate_sources(value,'138.91.2.60/32')

    def test_wrong_region_or_size_rejected(self):
        t=self.template();t['variables']['location']='japanwest'
        with self.assertRaises(ValueError):dr.validate_template(t)
        t=self.template();t['resources'][-1]['properties']['hardwareProfile']['vmSize']='Standard_D16s_v5'
        with self.assertRaises(ValueError):dr.validate_template(t)

    def test_database_or_web_ingress_rejected(self):
        for port in ('443','5432','15432','*'):
            t=self.template();t['resources'][0]['properties']['securityRules'][0]['properties']['destinationPortRange']=port
            with self.subTest(port=port),self.assertRaises(ValueError):dr.validate_template(t)

    def test_no_extra_resources(self):
        t=self.template();t['resources'].append(copy.deepcopy(t['resources'][-1]))
        with self.assertRaises(ValueError):dr.validate_template(t)

    def test_only_creates_in_new_group(self):
        base=f'/subscriptions/{dr.SUB}/resourceGroups/{dr.GROUP}/providers/'
        changes=[{'changeType':'Create','resourceId':base+t+'/new','after':{'type':t}} for t in dr.EXPECTED]
        self.assertTrue(dr.check_what_if({'status':'Succeeded','changes':changes}))
        for mutation in ('Modify','Delete','NoChange'):
            value=copy.deepcopy(changes);value[0]['changeType']=mutation
            with self.assertRaises(ValueError):dr.check_what_if({'status':'Succeeded','changes':value})
        value=copy.deepcopy(changes);value[0]['resourceId']='/subscriptions/other/resourceGroups/production/providers/vm'
        with self.assertRaises(ValueError):dr.check_what_if({'status':'Succeeded','changes':value})


if __name__=='__main__':unittest.main()
