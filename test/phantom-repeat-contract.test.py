import importlib.util
import pathlib
import unittest

ROOT = pathlib.Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location('repeat', ROOT / 'scripts/capstone-browser-repeat-check.py')
repeat = importlib.util.module_from_spec(spec)
spec.loader.exec_module(repeat)


class ContractTests(unittest.TestCase):
    def test_fixed_phantom_contract_rejects_weaker_evidence(self):
        phantom = dict(result='PASS', modality='CT', instanceCount=12, uniqueInstances=12,
                       exactInstances=True, dimensions256=True, nextSlice=True)
        self.assertTrue(repeat.phantom_result_matches({'phantom':phantom}, 'CT'))
        self.assertFalse(repeat.phantom_result_matches({'phantom':phantom}, 'MR'))
        self.assertFalse(repeat.phantom_result_matches({}, 'CT'))
        for key in phantom:
            weaker = {**phantom, key:None}
            self.assertFalse(repeat.phantom_result_matches({'phantom':weaker}, 'CT'), key)


if __name__ == '__main__': unittest.main()
