#!/usr/bin/env python3
"""Local Arkoto preview and read-only API, using only Python's standard library."""

from __future__ import annotations

import argparse
import json
import mimetypes
from datetime import datetime
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, unquote, urlsplit
from zoneinfo import ZoneInfo

from arkoto.catalog import Catalog
from arkoto.images import ImageCatalog
from arkoto.birthdays import BirthdayCatalog, validate_birthday_date


ROOT = Path(__file__).resolve().parent
PUBLIC = (ROOT / "public").resolve()
DATABASE = ROOT / "data" / "generated" / "arkoto.sqlite3"
WALLPAPERS = ROOT / "data" / "wallpapers.json"
IMAGE_INDEX = ROOT / "data" / "image_index.json"
BIRTHDAY_INDEX = ROOT / "data" / "birthday_index.json"
SHANGHAI = ZoneInfo("Asia/Shanghai")


def load_wallpapers() -> list[dict]:
    if not WALLPAPERS.exists():
        return []
    value = json.loads(WALLPAPERS.read_text(encoding="utf-8"))
    if not isinstance(value, list):
        raise ValueError("data/wallpapers.json must be an array")
    return [item for item in value if isinstance(item, dict) and item.get("url") and item.get("source")]


def create_handler(catalog: Catalog, wallpapers: list[dict], images: ImageCatalog, birthdays: BirthdayCatalog | None = None):
    birthdays = birthdays or BirthdayCatalog(BIRTHDAY_INDEX)
    class Handler(BaseHTTPRequestHandler):
        server_version = "Arkoto/0.1"

        def log_message(self, format_string: str, *args: object) -> None:
            print(f"{self.address_string()} - {format_string % args}")

        def send_common_headers(self, content_type: str, length: int, cache_control: str = "no-store") -> None:
            self.send_header("Content-Type", content_type)
            self.send_header("Content-Length", str(length))
            self.send_header("Cache-Control", cache_control)
            self.send_header("Access-Control-Allow-Origin", "*")
            self.send_header("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS")
            self.send_header("X-Content-Type-Options", "nosniff")
            self.send_header("Referrer-Policy", "strict-origin-when-cross-origin")

        def send_json(self, status: int, body: dict, cache_control: str = "no-store") -> None:
            payload = json.dumps(body, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
            self.send_response(status)
            self.send_common_headers("application/json; charset=utf-8", len(payload), cache_control)
            self.end_headers()
            if self.command != "HEAD":
                self.wfile.write(payload)

        def do_OPTIONS(self) -> None:
            self.send_response(204)
            self.send_header("Access-Control-Allow-Origin", "*")
            self.send_header("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS")
            self.send_header("Access-Control-Allow-Headers", "Content-Type")
            self.end_headers()

        def do_GET(self) -> None:
            parsed = urlsplit(self.path)
            query = parse_qs(parsed.query, keep_blank_values=False)
            path = parsed.path
            if path.startswith("/api/"):
                self.handle_api(path, query)
            else:
                self.handle_static(path)

        def do_HEAD(self) -> None:
            self.do_GET()

        def handle_api(self, path: str, query: dict[str, list[str]]) -> None:
            def first(name: str) -> str:
                return query.get(name, [""])[0].strip()[:100]

            if path == "/api/v1/status":
                self.send_json(200, {
                    "status": "ok",
                    "lines": len(catalog.lines),
                    "operators": len(catalog.by_operator),
                    "wallpapers": len(wallpapers),
                    "portraits": len(images.portraits),
                    "story_cg": len(images.cg_files),
                    "birthdays": sum(item["birthday"]["month"] is not None for item in birthdays.operators),
                    "birthdays_imported_at": birthdays.imported_at,
                    "imported_at": catalog.meta.get("imported_at"),
                    "source": catalog.meta.get("source"),
                }, "public, max-age=60")
                return
            if path == "/api/v1/operators":
                try:
                    limit = max(1, min(int(first("limit") or "50"), 200))
                except ValueError:
                    self.send_json(400, {"error": "invalid_limit"})
                    return
                self.send_json(200, {"data": catalog.operators(first("q"), limit)})
                return
            if path == "/api/v1/categories":
                items = [{"title": title, "line_count": count} for title, count in catalog.titles.most_common()]
                self.send_json(200, {"data": items}, "public, max-age=3600")
                return
            if path in ("/api/v1/birthdays", "/api/v1/birthdays/today"):
                today = path.endswith("/today")
                requested_date = first("date")
                if today and requested_date:
                    self.send_json(400, {"error": "date_not_allowed", "message": "指定日期请使用 /api/v1/birthdays?date=MM-DD"})
                    return
                try:
                    if requested_date:
                        validate_birthday_date(requested_date)
                except ValueError:
                    self.send_json(400, {"error": "invalid_date", "message": "date 必须为有效的 MM-DD 日期，例如 12-23"})
                    return
                day = datetime.now(SHANGHAI).date().isoformat() if today else ""
                items = birthdays.select(first("operator"), day[5:] if today else requested_date)
                self.send_json(200, {
                    "date": day if today else (requested_date or None),
                    "timezone": "Asia/Shanghai",
                    "data": [{"operator": {"id": item["id"], "name": item["name"]},
                              "birthday": item["birthday"], "illustration": images.portrait(item["id"]),
                              "source": birthdays.source} for item in items],
                    "imported_at": birthdays.imported_at,
                }, "no-store" if today else "public, max-age=3600")
                return
            if path in ("/api/v1/quotes/random", "/api/v1/quotes/today"):
                operator, title = first("operator"), first("title")
                day = datetime.now(SHANGHAI).date().isoformat() if path.endswith("/today") else ""
                line = catalog.select(operator=operator, title=title, daily_key=day)
                if line is None:
                    self.send_json(404, {"error": "no_matching_quote", "message": "没有找到符合条件的台词"})
                    return
                self.send_json(200, {
                    "id": line["id"],
                    "content": line["content"],
                    "operator": {"id": line["operator_id"], "name": line["operator_name"]},
                    "title": line["title"],
                    "edition": "CN",
                    "date": day or None,
                    "source": catalog.meta.get("source"),
                    "illustration": images.portrait(line["operator_id"]),
                }, "public, max-age=3600" if day else "no-store")
                return
            if path == "/api/v1/cg/random":
                cg = images.random_cg()
                if cg is None:
                    self.send_json(503, {"error": "cg_catalog_unavailable"})
                else:
                    self.send_json(200, {"data": cg})
                return
            if path == "/api/v1/wallpapers/random":
                orientation = first("orientation")
                if orientation and orientation not in ("horizontal", "vertical"):
                    self.send_json(400, {"error": "invalid_orientation"})
                    return
                items = [item for item in wallpapers if not orientation or item.get("orientation") == orientation]
                if not items:
                    self.send_json(503, {"error": "wallpaper_catalog_unavailable", "message": "尚无可公开使用的壁纸素材"})
                    return
                import random
                self.send_json(200, {"data": random.choice(items)})
                return
            self.send_json(404, {"error": "not_found"})

        def handle_static(self, path: str) -> None:
            relative = unquote(path).lstrip("/") or "index.html"
            if relative == "docs":
                relative = "docs.html"
            file_path = (PUBLIC / relative).resolve()
            if not file_path.is_relative_to(PUBLIC) or not file_path.is_file():
                self.send_json(404, {"error": "not_found"})
                return
            payload = file_path.read_bytes()
            content_type = mimetypes.guess_type(file_path.name)[0] or "application/octet-stream"
            if content_type.startswith("text/") or content_type in ("application/javascript", "application/json"):
                content_type += "; charset=utf-8"
            self.send_response(200)
            self.send_common_headers(content_type, len(payload), "public, max-age=300")
            self.end_headers()
            if self.command != "HEAD":
                self.wfile.write(payload)

    return Handler


def main() -> None:
    parser = argparse.ArgumentParser(description="Run Arkoto locally")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8765)
    parser.add_argument("--database", type=Path, default=DATABASE)
    args = parser.parse_args()
    if not args.database.exists():
        parser.error("Database missing. Run: python3 -m scripts.import_data")
    catalog = Catalog(args.database)
    wallpapers = load_wallpapers()
    images = ImageCatalog(IMAGE_INDEX)
    server = ThreadingHTTPServer((args.host, args.port), create_handler(catalog, wallpapers, images))
    print(f"Arkoto: http://{args.host}:{args.port} ({len(catalog.lines)} lines)", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
