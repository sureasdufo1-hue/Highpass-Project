import argparse
import json
import sys
import time

parser = argparse.ArgumentParser()
parser.add_argument("--checkpoint")
parser.add_argument("--device")
parser.add_argument("--ready", action="store_true")
parser.add_argument("--count-tokens", action="store_true")
args = parser.parse_args()
if "stdin-close" in args.checkpoint:
    # Exercise a broken input pipe, not the scheduler-dependent race between
    # process close and stdin error. The adapter must kill/reap this owned child.
    sys.stdin.close()
    time.sleep(0.5)
    sys.exit(1)
if "early-exit" in args.checkpoint:
    sys.exit(1)
text = sys.stdin.read()

if args.ready:
    print(json.dumps({"ok": True, "ready": True, "model_revision": "fake", "runtime_revision": "fake"}))
elif args.count_tokens:
    print(json.dumps({"ok": True, "token_count": len(text)}))
elif text == "timeout":
    time.sleep(0.25)
    print(json.dumps({"ok": True, "detected_spans": []}))
elif text == "long-timeout":
    time.sleep(10)
    print(json.dumps({"ok": True, "detected_spans": []}))
elif text == "bad-json":
    print("not-json")
elif text == "output-overflow":
    print("x" * (4 * 1024 * 1024 + 1))
elif text == "model-unavailable":
    print(json.dumps({"ok": False, "code": "MODEL_UNAVAILABLE"}))
elif text == "bad-span":
    print(json.dumps({"ok": True, "detected_spans": [{"label": "private_person", "start": "0", "end": 3, "text": "bad"}]}))
else:
    print(json.dumps({"ok": True, "detected_spans": [], "model_revision": "fake", "runtime_revision": "fake"}))
