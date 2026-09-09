"""Protocolo JSON usado pelo processo Electron."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from .reader import ReaderError, read_saved_page
from .reader_markdown import export_markdown


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="ai-reader")
    commands = parser.add_subparsers(dest="command", required=True)
    read = commands.add_parser("read")
    read.add_argument("source", type=Path)
    export = commands.add_parser("export")
    export.add_argument("source", type=Path)
    export.add_argument("destination", type=Path)
    args = parser.parse_args(argv)
    try:
        document = read_saved_page(args.source)
        payload = document.to_dict()
        if args.command == "export":
            payload["exported_path"] = str(export_markdown(document, args.destination))
        print(json.dumps({"ok": True, "document": payload}, ensure_ascii=False))
        return 0
    except ReaderError as exc:
        print(json.dumps({"ok": False, "error": {"code": exc.code, "message": str(exc)}}, ensure_ascii=False))
        return 2
    except FileExistsError as exc:
        print(json.dumps({"ok": False, "error": {"code": "DESTINATION_EXISTS", "message": str(exc)}}, ensure_ascii=False))
        return 3
    except OSError as exc:
        print(json.dumps({"ok": False, "error": {"code": "IO_ERROR", "message": str(exc)}}, ensure_ascii=False))
        return 4


if __name__ == "__main__":
    sys.exit(main())
