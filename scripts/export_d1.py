"""Export the local quote catalog for Cloudflare D1 without committing game text."""

from __future__ import annotations

import argparse
import json
import sqlite3
from collections import Counter, defaultdict
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DATABASE = ROOT / "data" / "generated" / "arkoto.sqlite3"
SQL_OUTPUT = ROOT / "data" / "generated" / "arkoto-d1.sql"
INDEX_OUTPUT = ROOT / "data" / "catalog_index.json"


def sql_text(value: str) -> str:
    if "\x00" in value:
        raise ValueError("NUL byte cannot be exported to D1 SQL")
    return "'" + value.replace("'", "''") + "'"


def export_d1(database: Path, sql_output: Path, index_output: Path) -> dict:
    connection = sqlite3.connect(database)
    connection.row_factory = sqlite3.Row
    try:
        lines = [dict(row) for row in connection.execute("SELECT * FROM lines ORDER BY id")]
        meta = {row["key"]: row["value"] for row in connection.execute("SELECT * FROM meta")}
    finally:
        connection.close()
    if not lines:
        raise ValueError("Catalog is empty")

    counts = {
        "operator_id": Counter(),
        "operator_name": Counter(),
        "title": Counter(),
        "operator_id_title": defaultdict(Counter),
    }
    operator_names: dict[str, str] = {}
    name_to_ids: dict[str, list[str]] = {}
    sql_output.parent.mkdir(parents=True, exist_ok=True)
    with sql_output.open("w", encoding="utf-8") as output:
        output.write(
            "DROP TABLE IF EXISTS quotes;\n"
            "CREATE TABLE quotes ("
            "seq INTEGER PRIMARY KEY, id TEXT NOT NULL, operator_id TEXT NOT NULL, "
            "operator_name TEXT NOT NULL, title TEXT NOT NULL, content TEXT NOT NULL, "
            "operator_seq INTEGER NOT NULL, title_seq INTEGER NOT NULL, "
            "operator_title_seq INTEGER NOT NULL);\n"
        )
        for seq, line in enumerate(lines):
            operator_id, name, title = line["operator_id"], line["operator_name"], line["title"]
            operator_names[operator_id] = name
            ids = name_to_ids.setdefault(name, [])
            if operator_id not in ids:
                ids.append(operator_id)
            positions = (
                counts["operator_id"][operator_id],
                counts["title"][title],
                counts["operator_id_title"][operator_id][title],
            )
            values = [str(seq)] + [sql_text(line[key]) for key in ("id", "operator_id", "operator_name", "title", "content")]
            values.extend(str(position) for position in positions)
            output.write("INSERT INTO quotes VALUES (" + ",".join(values) + ");\n")
            counts["operator_id"][operator_id] += 1
            counts["operator_name"][name] += 1
            counts["title"][title] += 1
            counts["operator_id_title"][operator_id][title] += 1
        output.write(
            "CREATE UNIQUE INDEX quotes_operator_seq ON quotes(operator_id,operator_seq);\n"
            "CREATE UNIQUE INDEX quotes_title_seq ON quotes(title,title_seq);\n"
            "CREATE UNIQUE INDEX quotes_operator_title_seq ON quotes(operator_id,title,operator_title_seq);\n"
        )

    operators = sorted(
        ({"id": operator_id, "name": name, "line_count": counts["operator_id"][operator_id]}
         for operator_id, name in operator_names.items()),
        key=lambda item: (item["name"].casefold(), item["id"]),
    )
    index = {
        "source": meta.get("source"),
        "imported_at": meta.get("imported_at"),
        "lines": len(lines),
        "operators": operators,
        "name_to_ids": name_to_ids,
        "categories": [{"title": title, "line_count": count} for title, count in counts["title"].most_common()],
        "counts": {
            key: {outer: dict(inner) for outer, inner in value.items()} if key.endswith("_title") else dict(value)
            for key, value in counts.items()
        },
    }
    index_output.parent.mkdir(parents=True, exist_ok=True)
    index_output.write_text(json.dumps(index, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    return {"lines": len(lines), "operators": len(operators), "sql_bytes": sql_output.stat().st_size, "index_bytes": index_output.stat().st_size}


def main() -> None:
    parser = argparse.ArgumentParser(description="Export local SQLite data for Cloudflare D1")
    parser.add_argument("--database", type=Path, default=DATABASE)
    parser.add_argument("--sql", type=Path, default=SQL_OUTPUT)
    parser.add_argument("--index", type=Path, default=INDEX_OUTPUT)
    args = parser.parse_args()
    print(json.dumps(export_d1(args.database, args.sql, args.index), ensure_ascii=False))


if __name__ == "__main__":
    main()
