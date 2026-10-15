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

test("image cache only fetches indexed files from fixed sources", async (t) => {
  let fetches = 0;
  t.mock.method(globalThis, "fetch", async (url, options) => {
    fetches++;
    assert.equal(options.redirect, "manual");
    assert.equal(url, "https://raw.githubusercontent.com/ArknightsAssets/ArknightsAssets2/refs/heads/cn/assets/dyn/arts/charportraits/char_002_amiya_2.png");
    return new Response("image-bytes", { headers: { "Content-Type": "image/png" } });
  });
  for (const path of ["/api/v1/images/portraits/unknown.png", "/api/v1/images/cg/https%3A%2F%2Fevil.test", "/api/v1/images/portraits/%ZZ", "/api/v1/images/other/test.png"]) {
    assert.equal((await call(path)).status, 404);
  }
  assert.equal(fetches, 0);
  const response = await call("/api/v1/images/portraits/char_002_amiya_2.png");
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("X-Arkoto-Cache"), "MISS");
  assert.equal(response.headers.get("Access-Control-Allow-Origin"), "*");
  assert.equal(await response.text(), "image-bytes");
  assert.equal(fetches, 1);
});

test("image GET populates cache, canonical query keys and HEAD reuse it", async (t) => {
  const saved = new Map();
  const pending = [];
  const original = globalThis.caches;
  globalThis.caches = { default: {
    match: async (key) => saved.get(key.url)?.clone(),
    put: async (key, response) => { saved.set(key.url, new Response(await response.arrayBuffer(), response)); },
  } };
  t.after(() => { if (original === undefined) delete globalThis.caches; else globalThis.caches = original; });
  let fetches = 0;
  t.mock.method(globalThis, "fetch", async () => {
    fetches++;
    return new Response("png-bytes", { headers: { "Content-Type": "image/png", ETag: '"v1"' } });
  });
  const path = "https://arkoto.test/api/v1/images/cg/avg_ac15_5.png";
  const miss = await worker.fetch(new Request(path + "?ignored=1"), {}, { waitUntil: (promise) => pending.push(promise) });
  assert.equal(await miss.text(), "png-bytes");
  await Promise.all(pending);
  const hit = await worker.fetch(new Request(path + "?ignored=2"), {});
  assert.equal(hit.headers.get("X-Arkoto-Cache"), "HIT");
  assert.equal(hit.headers.get("ETag"), '"v1"');
  assert.match(hit.headers.get("Cache-Control"), /max-age=86400/);
  assert.equal(await hit.text(), "png-bytes");
  const head = await worker.fetch(new Request(path, { method: "HEAD" }), {});
  assert.equal(head.headers.get("X-Arkoto-Cache"), "HIT");
  assert.equal(await head.text(), "");
  assert.equal(fetches, 1);
});

test("image failures are not cached and HEAD misses never cache an empty GET", async (t) => {
  const original = globalThis.caches;
  let writes = 0;
  globalThis.caches = { default: { match: async () => undefined, put: async () => { writes++; } } };
  t.after(() => { if (original === undefined) delete globalThis.caches; else globalThis.caches = original; });
  const path = "https://arkoto.test/api/v1/images/cg/avg_ac15_5.png";
  const context = { waitUntil: (promise) => promise };
  const mock = t.mock.method(globalThis, "fetch", async () => new Response("not an image", { headers: { "Content-Type": "text/html" } }));
  assert.equal((await worker.fetch(new Request(path), {}, context)).status, 502);
  mock.mock.mockImplementation(async () => { throw new Error("offline"); });
  const failed = await worker.fetch(new Request(path), {}, context);
  assert.equal(failed.status, 502);
  assert.equal(failed.headers.get("Cache-Control"), "no-store");
  mock.mock.mockImplementation(async () => new Response(null, { headers: { "Content-Type": "image/png" } }));
  assert.equal((await worker.fetch(new Request(path, { method: "HEAD" }), {}, context)).status, 200);
  assert.equal(writes, 0);
  assert.equal((await call("/api/v1/images/cg/avg_ac15_5.png", "POST")).status, 405);
  assert.equal((await call("/api/v1/images/cg/avg_ac15_5.png", "OPTIONS")).status, 204);
});
