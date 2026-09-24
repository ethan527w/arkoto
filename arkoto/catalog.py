"""Import and query a small, local Arknights voice line catalog."""

from __future__ import annotations

import hashlib
import html
import json
import random
import re
import sqlite3
from collections import Counter
from datetime import datetime
from pathlib import Path


SOURCE = "https://github.com/ArknightsAssets/ArknightsGamedata"
TAG_RE = re.compile(r"<[^>]*>")


def clean_text(value: object) -> str:
    if not isinstance(value, str):
        return ""
    value = html.unescape(TAG_RE.sub("", value))
    return " ".join(value.split())


def import_catalog(charwords_path: Path, characters_path: Path, database_path: Path) -> dict:
    """Build a new database and replace the old one only after import succeeds."""
    charwords = json.loads(charwords_path.read_text(encoding="utf-8"))["charWords"]
    characters = json.loads(characters_path.read_text(encoding="utf-8"))
    if not isinstance(charwords, dict) or not isinstance(characters, dict):
        raise ValueError("Unexpected Arknights data format")

    database_path.parent.mkdir(parents=True, exist_ok=True)
    temporary_path = database_path.with_suffix(database_path.suffix + ".tmp")
    temporary_path.unlink(missing_ok=True)
    connection = sqlite3.connect(temporary_path)
    try:
        connection.executescript(
            """
            CREATE TABLE lines (
                id TEXT PRIMARY KEY,
                operator_id TEXT NOT NULL,
                operator_name TEXT NOT NULL,
                title TEXT NOT NULL,
                content TEXT NOT NULL,
                voice_type TEXT NOT NULL
            );
            CREATE INDEX lines_operator ON lines(operator_id);
            CREATE INDEX lines_title ON lines(title);
            CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
            """
        )
        records = []
        for word_id, line in charwords.items():
            if not isinstance(line, dict):
                continue
            operator_id = line.get("charId", "")
            character = characters.get(operator_id, {})
            content = clean_text(line.get("voiceText"))
            title = clean_text(line.get("voiceTitle"))
            operator_name = clean_text(character.get("name")) if isinstance(character, dict) else ""
            if not (word_id and operator_id and operator_name and title and content):
                continue
            records.append((word_id, operator_id, operator_name, title, content, str(line.get("voiceType", ""))))
        if not records:
            raise ValueError("Import produced no voice lines")
        connection.executemany("INSERT INTO lines VALUES (?, ?, ?, ?, ?, ?)", records)
        metadata = {
            "source": SOURCE,
            "imported_at": datetime.now().astimezone().isoformat(timespec="seconds"),
            "line_count": str(len(records)),
            "operator_count": str(len({record[1] for record in records})),
            "charwords_sha256": hashlib.sha256(charwords_path.read_bytes()).hexdigest(),
            "characters_sha256": hashlib.sha256(characters_path.read_bytes()).hexdigest(),
        }
        connection.executemany("INSERT INTO meta VALUES (?, ?)", metadata.items())
        connection.commit()
    except Exception:
        connection.close()
        temporary_path.unlink(missing_ok=True)
        raise
    connection.close()
    temporary_path.replace(database_path)
    return {"lines": len(records), "operators": len({record[1] for record in records}), "database_bytes": database_path.stat().st_size}


class Catalog:
    def __init__(self, database_path: Path):
        connection = sqlite3.connect(database_path)
        connection.row_factory = sqlite3.Row
        try:
            self.lines = [dict(row) for row in connection.execute("SELECT * FROM lines ORDER BY id")]
            self.meta = {row["key"]: row["value"] for row in connection.execute("SELECT * FROM meta")}
        finally:
            connection.close()
        self.by_operator: dict[str, list[dict]] = {}
        self.by_title: dict[str, list[dict]] = {}
        self.names: dict[str, list[str]] = {}
        for line in self.lines:
            self.by_operator.setdefault(line["operator_id"], []).append(line)
            self.by_title.setdefault(line["title"], []).append(line)
            ids = self.names.setdefault(line["operator_name"], [])
            if line["operator_id"] not in ids:
                ids.append(line["operator_id"])
        self.titles = Counter(line["title"] for line in self.lines)

    def select(self, operator: str = "", title: str = "", daily_key: str = "") -> dict | None:
        operator_ids = [operator] if operator in self.by_operator else self.names.get(operator, [])
        if operator and not operator_ids:
            return None
        if title and title not in self.by_title:
            return None
        if operator_ids and title:
            pool = [line for operator_id in operator_ids for line in self.by_operator[operator_id] if line["title"] == title]
        elif operator_ids:
            pool = [line for operator_id in operator_ids for line in self.by_operator[operator_id]]
        elif title:
            pool = self.by_title[title]
        else:
            pool = self.lines
        if not pool:
            return None
        if daily_key:
            seed = f"{daily_key}|{operator}|{title}".encode("utf-8")
            index = int.from_bytes(hashlib.sha256(seed).digest()[:8], "big") % len(pool)
            return pool[index]
        return random.choice(pool)

    def operators(self, query: str = "", limit: int = 50) -> list[dict]:
        names = sorted(self.names, key=lambda name: name.casefold())
        if query:
            names = [name for name in names if query.casefold() in name.casefold()]
        return [
            {"id": operator_id, "name": name, "line_count": len(self.by_operator[operator_id])}
            for name in names
            for operator_id in self.names[name]
        ][:limit]
