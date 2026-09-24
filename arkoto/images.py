"""Small index of externally hosted Arknights illustrations and story CGs."""

from __future__ import annotations

import json
import random
from pathlib import Path
from urllib.parse import quote


PORTRAIT_SOURCE = "https://github.com/ArknightsAssets/ArknightsAssets2/tree/cn/assets/dyn/arts/charportraits"
PORTRAIT_BASE = "https://raw.githubusercontent.com/ArknightsAssets/ArknightsAssets2/refs/heads/cn/assets/dyn/arts/charportraits/"
CG_SOURCE = "https://github.com/Aceship/Arknight-Images/tree/main/avg/images"
CG_BASE = "https://raw.githubusercontent.com/Aceship/Arknight-Images/refs/heads/main/avg/images/"


class ImageCatalog:
    def __init__(self, index_path: Path):
        data = json.loads(index_path.read_text(encoding="utf-8")) if index_path.exists() else {}
        self.portraits = data.get("portraits", {})
        self.cg_files = data.get("cg", [])
        if not isinstance(self.portraits, dict) or not isinstance(self.cg_files, list):
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

    def random_cg(self) -> dict | None:
        if not self.cg_files:
            return None
        filename = random.choice(self.cg_files)
        return {
            "type": "story_cg",
            "url": CG_BASE + quote(filename, safe=""),
            "source": CG_SOURCE,
            "filename": filename,
        }
