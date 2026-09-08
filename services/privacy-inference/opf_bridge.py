"""Fail-closed local bridge for the pinned OpenAI Privacy Filter package.

The input text is read only from stdin and is never included in diagnostic output.
An explicit local checkpoint is mandatory so this process cannot trigger a download.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path
import sys

RUNTIME_REVISION = "openai/privacy-filter@f7f00ca7fb869683eb732c010299d901457f19c3"


def _arguments() -> argparse.Namespace:
    parser = argparse.ArgumentParser(add_help=False)
    parser.add_argument("--checkpoint", required=True)
    parser.add_argument("--device", choices=("cpu", "cuda"), default="cpu")
    parser.add_argument("--ready", action="store_true")
    parser.add_argument("--count-tokens", action="store_true")
    return parser.parse_args()


def _checkpoint(args: argparse.Namespace) -> Path:
    checkpoint = Path(args.checkpoint).resolve(strict=True)
    if not checkpoint.is_dir() or not (checkpoint / "config.json").is_file():
        raise RuntimeError("checkpoint unavailable")
    return checkpoint


def _revision(checkpoint: Path) -> str:
    digest = hashlib.sha256()
    digest.update((checkpoint / "config.json").read_bytes())
    for item in sorted(checkpoint.iterdir(), key=lambda value: value.name):
        digest.update(item.name.encode("utf-8"))
        digest.update(str(item.stat().st_size).encode("ascii"))
    return digest.hexdigest()


def _text() -> str:
    return sys.stdin.buffer.read().decode("utf-8", errors="strict")


def _write(payload: dict[str, object]) -> None:
    sys.stdout.write(json.dumps(payload, ensure_ascii=False, separators=(",", ":")))


def main() -> int:
    os.environ["HF_HUB_OFFLINE"] = "1"
    os.environ["TRANSFORMERS_OFFLINE"] = "1"
    args = _arguments()
    try:
        checkpoint = _checkpoint(args)
        revision = _revision(checkpoint)
        if args.count_tokens:
            import tiktoken

            config = json.loads((checkpoint / "config.json").read_text(encoding="utf-8"))
            encoding_name = config.get("encoding")
            if not isinstance(encoding_name, str) or not encoding_name:
                raise RuntimeError("checkpoint encoding unavailable")
            token_count = len(tiktoken.get_encoding(encoding_name).encode(_text(), allowed_special="all"))
            _write({"ok": True, "token_count": token_count})
            return 0

        from opf import OPF

        redactor = OPF(model=str(checkpoint), device=args.device, output_mode="typed")
        if args.ready:
            redactor.get_prediction_components()
            _write({
                "ok": True,
                "ready": True,
                "model_revision": revision,
                "runtime_revision": RUNTIME_REVISION,
            })
            return 0

        result = redactor.redact(_text())
        spans = [
            {
                "label": span.label,
                "start": span.start,
                "end": span.end,
                "text": span.text,
            }
            for span in result.detected_spans
        ]
        _write({
            "ok": True,
            "detected_spans": spans,
            "warning": result.warning,
            "model_revision": revision,
            "runtime_revision": RUNTIME_REVISION,
        })
        return 0
    except UnicodeDecodeError:
        _write({"ok": False, "code": "INVALID_CONTENT"})
        return 22
    except Exception:
        _write({"ok": False, "code": "MODEL_UNAVAILABLE"})
        return 23


if __name__ == "__main__":
    raise SystemExit(main())
