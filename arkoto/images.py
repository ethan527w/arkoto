"""Small index of externally hosted Arknights operator portraits."""

from __future__ import annotations

import json
from pathlib import Path
from urllib.parse import quote


PORTRAIT_SOURCE = "https://github.com/ArknightsAssets/ArknightsAssets2/tree/cn/assets/dyn/arts/charportraits"
PORTRAIT_BASE = "https://raw.githubusercontent.com/ArknightsAssets/ArknightsAssets2/refs/heads/cn/assets/dyn/arts/charportraits/"


class ImageCatalog:
    def __init__(self, index_path: Path):
        data = json.loads(index_path.read_text(encoding="utf-8")) if index_path.exists() else {}
        self.portraits = data.get("portraits", {})
        if not isinstance(self.portraits, dict):
            raise ValueError("Invalid image index")

    def portrait(self, operator_id: str) -> dict | None:
        filename = self.portraits.get(operator_id)
        if not isinstance(filename, str):
            return None
        return {
            "type": "operator_portrait",
            "url": PORTRAIT_BASE + quote(filename, safe=""),
            "source": PORTRAIT_SOURCE,
            "filename": filename,
        }
