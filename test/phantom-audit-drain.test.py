import importlib.util
import pathlib
import unittest

ROOT = pathlib.Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location('phantom_audit', ROOT / 'scripts/capstone-phantom-audit-check.py')
audit = importlib.util.module_from_spec(spec)
spec.loader.exec_module(audit)


class Channel:
    def __init__(self, stdout=b'{}', stderr=b'SECRET', terminal=True):
        self.stdout, self.stderr, self.terminal = stdout, stderr, terminal
        self.closed = False

    def recv_ready(self): return bool(self.stdout)
    def recv_stderr_ready(self): return bool(self.stderr)
    def recv(self, size):
        chunk, self.stdout = self.stdout[:size], self.stdout[size:]
        return chunk
    def recv_stderr(self, size):
        chunk, self.stderr = self.stderr[:size], self.stderr[size:]
        return chunk
    def exit_status_ready(self): return self.terminal
    def recv_exit_status(self): return 0
    def close(self): self.closed = True


class DrainTests(unittest.TestCase):
    def test_drains_both_streams_without_exporting_stderr(self):
        channel = Channel()
        self.assertEqual(audit.drain_channel(channel), (0, '{}'))
        self.assertFalse(channel.stderr)
        self.assertTrue(channel.closed)

    def test_output_limit_closes_channel(self):
        channel = Channel(stdout=b'x' * 1048577, stderr=b'')
        with self.assertRaises(ValueError): audit.drain_channel(channel)
        self.assertTrue(channel.closed)

    def test_timeout_closes_channel(self):
        channel = Channel(stdout=b'', stderr=b'', terminal=False)
        with self.assertRaises(TimeoutError): audit.drain_channel(channel, seconds=0.01)
        self.assertTrue(channel.closed)


if __name__ == '__main__': unittest.main()
