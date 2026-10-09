import importlib.util
import pathlib
import unittest

source = pathlib.Path(__file__).resolve().parents[1] / "scripts/capstone-overlay-ops.py"
spec = importlib.util.spec_from_file_location("overlay_ops", source)
ops = importlib.util.module_from_spec(spec)
spec.loader.exec_module(ops)


class CounterTests(unittest.TestCase):
    def test_numeric_and_named_protocols_require_exact_tuple_drop(self):
        for protocol in ["tcp", "6"]:
            line = f"3 180 DROP {protocol} -- hp-capstone * 10.90.88.3 10.90.88.2 tcp dpt:8042"
            self.assertEqual(ops.exact_drop_counter(line), 3)
            for bad in [line.replace("DROP", "ACCEPT"), line.replace("10.90.88.2", "10.90.88.5"), line.replace("8042", "9443"), line.replace("hp-capstone", "eth0"), line + "\n" + line]:
                with self.assertRaises(RuntimeError):
                    ops.exact_drop_counter(bad)


if __name__ == "__main__":
    unittest.main()
