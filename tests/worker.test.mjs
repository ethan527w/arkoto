import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";
import { shanghaiDate } from "../src/dates.js";

const compiled = await build({ entryPoints: ["src/worker.js"], bundle: true, write: false, format: "esm", platform: "neutral", logLevel: "silent" });
const { default: worker } = await import(`data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].text).toString("base64")}`);
const call = (path, method = "GET") => worker.fetch(new Request(`https://arkoto.test${path}`, { method }), {});

test("birthday lookup returns verified profile data and the matching portrait", async () => {
  const response = await call("/api/v1/birthdays?operator=" + encodeURIComponent("阿米娅"));
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.date, null);
  assert.equal(result.timezone, "Asia/Shanghai");
  assert.equal(result.data.length, 1);
  const [item] = result.data;
  assert.deepEqual(item.operator, { id: "char_002_amiya", name: "阿米娅" });
  assert.deepEqual(item.birthday, { month: 12, day: 23, text: "12月23日" });
  assert.match(item.illustration.url, /char_002_amiya_2\.png$/);
  assert.match(item.source, /handbook_info_table\.json$/);
  const byId = await (await call("/api/v1/birthdays?operator=char_002_amiya&date=12-23")).json();
  assert.deepEqual(byId.data, result.data);
});

test("unknown birthdays stay queryable but cannot match a calendar date", async () => {
  const unknown = await (await call("/api/v1/birthdays?operator=" + encodeURIComponent("凯尔希"))).json();
  assert.deepEqual(unknown.data[0].birthday, { month: null, day: null, text: "未公开" });
  const filtered = await (await call("/api/v1/birthdays?date=12-23&operator=" + encodeURIComponent("凯尔希"))).json();
  assert.deepEqual(filtered.data, []);
  const missing = await call("/api/v1/birthdays?operator=nonexistent");
  assert.equal(missing.status, 200);
  assert.deepEqual((await missing.json()).data, []);
});

test("birthday dates accept leap days and reject invalid or ambiguous dates", async () => {
  assert.equal((await call("/api/v1/birthdays?date=02-29")).status, 200);
  for (const date of ["02-30", "04-31", "13-01", "00-01", "01-00", "2-9", "2026-12-23"]) {
    const response = await call(`/api/v1/birthdays?date=${date}`);
    assert.equal(response.status, 400, date);
    assert.equal((await response.json()).error, "invalid_date");
  }
  const override = await call("/api/v1/birthdays/today?date=12-23");
  assert.equal(override.status, 400);
  assert.equal((await override.json()).error, "date_not_allowed");
});

test("today uses Shanghai calendar boundaries and avoids stale cache across midnight", async () => {
  assert.equal(shanghaiDate(new Date("2026-12-31T15:59:59Z")), "2026-12-31");
  assert.equal(shanghaiDate(new Date("2026-12-31T16:00:00Z")), "2027-01-01");
  assert.equal(shanghaiDate(new Date("2028-02-28T16:00:00Z")), "2028-02-29");
  const response = await call("/api/v1/birthdays/today");
  assert.equal(response.headers.get("Cache-Control"), "no-store");
  const today = await response.json();
  assert.equal(today.date, shanghaiDate());
  for (const item of today.data) {
    assert.equal(`${String(item.birthday.month).padStart(2, "0")}-${String(item.birthday.day).padStart(2, "0")}`, today.date.slice(5));
  }
});

test("new endpoints keep CORS, HEAD, and read-only method behavior", async () => {
  const head = await call("/api/v1/birthdays/today", "HEAD");
  assert.equal(head.status, 200);
  assert.equal(await head.text(), "");
  assert.equal(head.headers.get("Access-Control-Allow-Origin"), "*");
  assert.equal((await call("/api/v1/birthdays", "OPTIONS")).status, 204);
  assert.equal((await call("/api/v1/birthdays", "POST")).status, 405);
});
