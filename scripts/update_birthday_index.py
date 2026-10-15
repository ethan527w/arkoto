"""Extract birthday dates, without retaining complete game profiles in the index."""

from __future__ import annotations

import argparse
import json
from datetime import datetime, timezone
from pathlib import Path

from arkoto.birthdays import build_birthday_index
from scripts.import_data import download

ROOT = Path(__file__).resolve().parents[1]


def main() -> None:
    parser = argparse.ArgumentParser(description="Build operator birthday metadata from game profiles")
    parser.add_argument("--download", action="store_true")
    parser.add_argument("--handbook", type=Path, default=ROOT / "data/raw/birthday_handbook_info_table.json")
    parser.add_argument("--characters", type=Path, default=ROOT / "data/raw/birthday_character_table.json")
    parser.add_argument("--output", type=Path, default=ROOT / "data/birthday_index.json")
    parser.add_argument("--source", default="https://github.com/ArknightsAssets/ArknightsGamedata")
    args = parser.parse_args()
    if args.download:
        download("handbook_info_table.json", args.handbook)
        download("character_table.json", args.characters)
    data = build_birthday_index(
        json.loads(args.handbook.read_text(encoding="utf-8")),
        json.loads(args.characters.read_text(encoding="utf-8")),
        args.source, datetime.now(timezone.utc).isoformat(timespec="seconds"),
    )
    args.output.parent.mkdir(parents=True, exist_ok=True)
    temporary = args.output.with_suffix(".json.tmp")
    temporary.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    temporary.replace(args.output)
    known = sum(item["birthday"]["month"] is not None for item in data["operators"])
    print(f"Indexed {len(data['operators'])} profiles, {known} known birthdays: {args.output}")


if __name__ == "__main__":
    main()
