"""Refresh image filenames from community mirrors; never download image binaries."""

from __future__ import annotations

import argparse
import json
import re
from pathlib import Path
from urllib.request import Request, urlopen


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_OUTPUT = ROOT / "data" / "image_index.json"
ARTS_URL = "https://api.github.com/repos/ArknightsAssets/ArknightsAssets2/contents/assets/dyn/arts?ref=cn"
TREE_URL = "https://api.github.com/repos/ArknightsAssets/ArknightsAssets2/git/trees/"
PORTRAIT_RE = re.compile(r"^(char_[A-Za-z0-9_]+)_([12])\.png$")


def fetch_json(url: str) -> object:
    request = Request(url, headers={"Accept": "application/vnd.github+json", "User-Agent": "Arkoto-image-index"})
    with urlopen(request, timeout=30) as response:
        return json.load(response)


def build_index(portrait_tree: dict) -> dict:
    if portrait_tree.get("truncated"):
        raise ValueError("GitHub portrait tree was truncated")
    portraits: dict[str, str] = {}
    for item in portrait_tree.get("tree", []):
        match = PORTRAIT_RE.fullmatch(item.get("path", ""))
        if match and item.get("type") == "blob":
            operator_id = match.group(1)
            filename = match.group(0)
            if match.group(2) == "2" or operator_id not in portraits:
                portraits[operator_id] = filename
    if not portraits:
        raise ValueError("Image index appears incomplete")
    return {"portraits": dict(sorted(portraits.items()))}


def main() -> None:
    parser = argparse.ArgumentParser(description="Update external image filename index")
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--portraits-json", type=Path)
    args = parser.parse_args()
    if args.portraits_json:
        portrait_tree = json.loads(args.portraits_json.read_text(encoding="utf-8"))
    else:
        arts = fetch_json(ARTS_URL)
        portrait_dir = next(item for item in arts if item["name"] == "charportraits")
        portrait_tree = fetch_json(TREE_URL + portrait_dir["sha"] + "?recursive=1")
    index = build_index(portrait_tree)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(index, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Indexed {len(index['portraits'])} portraits: {args.output}")


if __name__ == "__main__":
    main()
