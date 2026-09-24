#!/usr/bin/env python3
"""Import downloaded game data. No game content is bundled with this project."""

import argparse
import json
import sys
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from arkoto.catalog import import_catalog


RAW = ROOT / "data" / "raw"
BASE = "https://raw.githubusercontent.com/ArknightsAssets/ArknightsGamedata/master/cn/gamedata/excel"


def download(name: str, destination: Path) -> None:
    request = urllib.request.Request(f"{BASE}/{name}", headers={"User-Agent": "Arkoto-local-import/0.1"})
    with urllib.request.urlopen(request, timeout=90) as response:
        content = response.read()
    destination.parent.mkdir(parents=True, exist_ok=True)
    temporary = destination.with_suffix(destination.suffix + ".tmp")
    temporary.write_bytes(content)
    temporary.replace(destination)


def main() -> None:
    parser = argparse.ArgumentParser(description="Import Arknights CN voice lines into a local SQLite database")
    parser.add_argument("--download", action="store_true", help="Fetch the latest raw data before importing")
    parser.add_argument("--charwords", type=Path, default=RAW / "charword_table.json")
    parser.add_argument("--characters", type=Path, default=RAW / "character_table.json")
    parser.add_argument("--database", type=Path, default=ROOT / "data" / "generated" / "arkoto.sqlite3")
    args = parser.parse_args()
    if args.download:
        download("charword_table.json", args.charwords)
        download("character_table.json", args.characters)
    result = import_catalog(args.charwords, args.characters, args.database)
    print(json.dumps(result, ensure_ascii=False))


if __name__ == "__main__":
    main()
