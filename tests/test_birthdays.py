"""Preserve uncertain birthdays and reject impossible calendar dates."""

import json
import tempfile
import unittest
from pathlib import Path

from arkoto.birthdays import BirthdayCatalog, build_birthday_index, parse_birthday, validate_birthday_date


class BirthdayTest(unittest.TestCase):
    def test_extracts_profiles_and_preserves_unknown_dates(self):
        characters = {
            "char_a": {"name": "测试干员", "isNotObtainable": False, "profession": "CASTER"},
            "char_b": {"name": "未知生日", "isNotObtainable": False, "profession": "MEDIC"},
            "char_token": {"name": "召唤物", "isNotObtainable": False, "profession": "TOKEN"},
            "char_npc": {"name": "NPC", "isNotObtainable": True},
        }
        def profile(value):
            return {"storyTextAudio": [{"storyTitle": "基础档案", "stories": [{
                "storyText": f"【代号】示例\n【生日】{value}\n【种族】未公开",
            }]}]}
        handbook = {"handbookDict": {
            "char_a": profile("2月29日"), "char_b": profile("本人表示遗忘"),
            "char_token": profile("1月1日"), "char_npc": profile("1月1日"),
        }}
        index = build_birthday_index(handbook, characters, "https://example.com/profiles", "2026-10-15")
        self.assertEqual(len(index["operators"]), 2)
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / "birthdays.json"
            path.write_text(json.dumps(index), encoding="utf-8")
            catalog = BirthdayCatalog(path)
            self.assertEqual(catalog.select("测试干员")[0]["birthday"], {"month": 2, "day": 29, "text": "2月29日"})
            self.assertEqual(catalog.select("char_a", "02-29")[0]["name"], "测试干员")
            self.assertEqual(catalog.select("未知生日")[0]["birthday"], {"month": None, "day": None, "text": "本人表示遗忘"})
            self.assertEqual(catalog.select("未知生日", "02-29"), [])
            self.assertEqual(catalog.select("不存在"), [])
            self.assertEqual(catalog.select(birthday_date="12-23"), [])

    def test_calendar_validation_and_uncertain_birthdays(self):
        for value in ["02-29", "12-31", "01-01"]:
            self.assertEqual(validate_birthday_date(value), value)
        for value in ["02-30", "04-31", "13-01", "00-01", "01-00", "2-9", "2026-12-23"]:
            with self.subTest(value=value), self.assertRaises(ValueError):
                validate_birthday_date(value)
        for value in ["未公开", "未知", "不详", "12月？日", "2月30日", "7月7日或8日"]:
            self.assertEqual(parse_birthday(value), {"month": None, "day": None, "text": value})

    def test_rejects_empty_or_unrecognized_data(self):
        for handbook in [{}, {"handbookDict": {}}]:
            with self.assertRaises(ValueError):
                build_birthday_index(handbook, {}, "source", "date")
