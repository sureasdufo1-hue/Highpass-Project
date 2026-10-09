import importlib.util
import io
import pathlib
import subprocess
import sys
import threading
import unittest

ROOT = pathlib.Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location("audit_collector", ROOT / "scripts/capstone-concurrent-audit-check.py")
collector = importlib.util.module_from_spec(spec)
spec.loader.exec_module(collector)

class BoundedOutputTests(unittest.TestCase):
    def test_child_with_large_output_exits_while_both_pipes_are_drained(self):
        process = subprocess.Popen([sys.executable, "-c", "import sys;sys.stdout.write('x'*20000);sys.stderr.write('y'*20000)"], stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        buffers, overflow = [bytearray(), bytearray()], [False]
        threads = []
        try:
            for stream, target in zip([process.stdout, process.stderr], buffers):
                thread = threading.Thread(target=collector.drain_output, args=(stream, target, overflow), daemon=True)
                thread.start()
                threads.append(thread)
            self.assertEqual(process.wait(timeout=5), 0)
            for thread in threads:
                thread.join(timeout=2)
                self.assertFalse(thread.is_alive())
            self.assertFalse(overflow[0])
            self.assertEqual([len(value) for value in buffers], [20000, 20000])
        finally:
            if process.poll() is None:
                process.kill()
                process.wait(timeout=2)
            process.stdout.close()
            process.stderr.close()

    def test_overflow_keeps_draining_without_retaining_unbounded_output(self):
        stream, retained, overflow = io.BytesIO(b"x" * 200000), bytearray(), [False]
        collector.drain_output(stream, retained, overflow)
        self.assertTrue(overflow[0])
        self.assertLessEqual(len(retained), 65536)
        self.assertEqual(stream.tell(), 200000)

if __name__ == "__main__":
    unittest.main()
