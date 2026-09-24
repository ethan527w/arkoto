"""Image metadata must match operator IDs and keep external URLs encoded."""

import json
import tempfile
import unittest
from pathlib import Path

from arkoto.images import ImageCatalog
from scripts.update_image_index import build_index


class ImageIndexTest(unittest.TestCase):
    def test_prefers_elite_portrait_and_keeps_cg_separate(self):
        tree = {"truncated": False, "tree": [
            {"path": "char_002_amiya_1.png", "type": "blob"},
            {"path": "char_002_amiya_2.png", "type": "blob"},
            {"path": "char_010_chen_1.png", "type": "blob"},
            {"path": "char_010_chen_sale#1.png", "type": "blob"},
        ]}
        entries = [{"name": "story (1).png", "type": "file"}]
        index = build_index(tree, entries)
        self.assertEqual(index["portraits"]["char_002_amiya"], "char_002_amiya_2.png")
        self.assertEqual(index["portraits"]["char_010_chen"], "char_010_chen_1.png")
        self.assertEqual(index["cg"], ["story (1).png"])

        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "images.json"
            path.write_text(json.dumps(index), encoding="utf-8")
            catalog = ImageCatalog(path)
            self.assertIn("char_002_amiya_2.png", catalog.portrait("char_002_amiya")["url"])
            self.assertIsNone(catalog.portrait("unknown"))
            self.assertIn("story%20%281%29.png", catalog.random_cg()["url"])

    def test_rejects_truncated_index(self):
        with self.assertRaises(ValueError):
            build_index({"truncated": True, "tree": []}, [])
