import json
import tempfile
import unittest
from pathlib import Path

from arkoto.catalog import Catalog, import_catalog


class CatalogTest(unittest.TestCase):
    def test_import_filters_and_daily_selection(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            words = root / "words.json"
            characters = root / "characters.json"
            database = root / "catalog.sqlite3"
            words.write_text(json.dumps({"charWords": {
                "one": {"charId": "char_a", "voiceTitle": "任命助理", "voiceText": "您好，<color=#fff>博士</color>。"},
                "two": {"charId": "char_a", "voiceTitle": "问候", "voiceText": "早上好。"},
                "three": {"charId": "char_b", "voiceTitle": "问候", "voiceText": "你好。"},
                "empty": {"charId": "char_b", "voiceTitle": "问候", "voiceText": ""},
            }}), encoding="utf-8")
            characters.write_text(json.dumps({
                "char_a": {"name": "测试干员"},
                "char_b": {"name": "另一位"},
            }), encoding="utf-8")
            result = import_catalog(words, characters, database)
            self.assertEqual(result["lines"], 3)
            catalog = Catalog(database)
            self.assertEqual(catalog.select("测试干员", "任命助理")["content"], "您好，博士。")
            self.assertIsNone(catalog.select("未知干员"))
            self.assertIsNone(catalog.select("另一位", "任命助理"))
            self.assertEqual(catalog.select(daily_key="2026-09-24"), catalog.select(daily_key="2026-09-24"))
            self.assertEqual(len(catalog.operators("测试")), 1)

    def test_failed_import_keeps_existing_database(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            words = root / "words.json"
            characters = root / "characters.json"
            database = root / "catalog.sqlite3"
            words.write_text(json.dumps({"charWords": {"one": {
                "charId": "char_a", "voiceTitle": "问候", "voiceText": "你好。",
            }}}), encoding="utf-8")
            characters.write_text(json.dumps({"char_a": {"name": "测试干员"}}), encoding="utf-8")
            import_catalog(words, characters, database)
            before = database.read_bytes()
            words.write_text("{}", encoding="utf-8")
            with self.assertRaises(KeyError):
                import_catalog(words, characters, database)
            self.assertEqual(database.read_bytes(), before)


if __name__ == "__main__":
    unittest.main()

