"""Birthday metadata from the game's basic operator profiles."""

from __future__ import annotations

import json
import re
from datetime import date
from pathlib import Path

from arkoto.catalog import clean_text

BIRTHDAY_LINE = re.compile(r"【生日】\s*([^\r\n【]+)")
BIRTHDAY_DATE = re.compile(r"(\d{1,2})月(\d{1,2})日")


def parse_birthday(value: str) -> dict:
    text = clean_text(value)
    match = BIRTHDAY_DATE.fullmatch(text)
    if match:
        month, day = map(int, match.groups())
        try:
            date(2000, month, day)  # Leap-day birthdays are valid.
            return {"month": month, "day": day, "text": text}
        except ValueError:
            pass
    return {"month": None, "day": None, "text": text}


def build_birthday_index(handbook: dict, characters: dict, source: str, imported_at: str) -> dict:
    entries = handbook.get("handbookDict")
    if not isinstance(entries, dict) or not isinstance(characters, dict):
        raise ValueError("Unexpected operator profile format")
    operators = []
    for operator_id, profile in entries.items():
        character = characters.get(operator_id, {})
        if not isinstance(character, dict) or character.get("isNotObtainable", True):
            continue
        if character.get("profession") in ("TOKEN", "TRAP"):
            continue
        name = clean_text(character.get("name"))
        if not name or not isinstance(profile, dict):
            continue
        birthday = None
        for section in profile.get("storyTextAudio", []):
            for story in section.get("stories", []):
                match = BIRTHDAY_LINE.search(story.get("storyText", ""))
                if match:
                    birthday = parse_birthday(match.group(1))
                    break
            if birthday is not None:
                break
        if birthday is not None:
            operators.append({"id": operator_id, "name": name, "birthday": birthday})
    if not operators or not any(item["birthday"]["month"] for item in operators):
        raise ValueError("Import produced no valid birthdays")
    operators.sort(key=lambda item: (
        item["birthday"]["month"] or 13, item["birthday"]["day"] or 32, item["name"], item["id"],
    ))
    return {"source": source, "imported_at": imported_at, "operators": operators}


def validate_birthday_date(value: str) -> str:
    if not re.fullmatch(r"\d{2}-\d{2}", value):
        raise ValueError("date must use MM-DD")
    month, day = map(int, value.split("-"))
    date(2000, month, day)
    return value


class BirthdayCatalog:
    def __init__(self, path: Path):
        data = json.loads(path.read_text(encoding="utf-8"))
        self.source = data["source"]
        self.imported_at = data["imported_at"]
        self.operators = data["operators"]

    def select(self, operator: str = "", birthday_date: str = "") -> list[dict]:
        if birthday_date:
            validate_birthday_date(birthday_date)
        return [item for item in self.operators
                if (not operator or operator in (item["id"], item["name"]))
                and (not birthday_date or
                     (item["birthday"]["month"] is not None and
                      f'{item["birthday"]["month"]:02d}-{item["birthday"]["day"]:02d}' == birthday_date))]
