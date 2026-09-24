/** Cloudflare Worker API. Static files in public/ are served by the assets binding. */

import catalog from "../data/catalog_index.json";
import images from "../data/image_index.json";

const PORTRAIT_SOURCE = "https://github.com/ArknightsAssets/ArknightsAssets2/tree/cn/assets/dyn/arts/charportraits";
const PORTRAIT_BASE = "https://raw.githubusercontent.com/ArknightsAssets/ArknightsAssets2/refs/heads/cn/assets/dyn/arts/charportraits/";

function json(request, status, body, cacheControl = "no-store") {
  return new Response(request.method === "HEAD" ? null : JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": cacheControl,
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "strict-origin-when-cross-origin",
    },
  });
}

function first(params, name) {
  return (params.get(name) || "").trim().slice(0, 100);
}

function shanghaiDate() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date());
  const part = (name) => parts.find((item) => item.type === name).value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}

async function choosePosition(count, dailySeed) {
  if (!dailySeed) return crypto.getRandomValues(new Uint32Array(1))[0] % count;
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(dailySeed));
  return Number(new DataView(digest).getBigUint64(0, false) % BigInt(count));
}

function imageFor(operatorId) {
  const filename = images.portraits[operatorId];
  if (!filename) return null;
  return {
    type: "operator_portrait",
    url: PORTRAIT_BASE + encodeURIComponent(filename),
    source: PORTRAIT_SOURCE,
    filename,
  };
}

function quoteSelection(operator, title) {
  const isId = Object.hasOwn(catalog.counts.operator_id, operator);
  const isName = Object.hasOwn(catalog.counts.operator_name, operator);
  if (operator && !isId && !isName) return null;
  if (title && !Object.hasOwn(catalog.counts.title, title)) return null;

  if (operator && isId) return {
    count: title ? catalog.counts.operator_id_title[operator]?.[title] || 0 : catalog.counts.operator_id[operator],
    groups: [{ id: operator, count: title ? catalog.counts.operator_id_title[operator]?.[title] || 0 : catalog.counts.operator_id[operator] }],
  };
  if (operator) {
    const groups = catalog.name_to_ids[operator].map((id) => ({
      id, count: title ? catalog.counts.operator_id_title[id]?.[title] || 0 : catalog.counts.operator_id[id],
    }));
    return { count: groups.reduce((sum, group) => sum + group.count, 0), groups };
  }
  if (title) return {
    count: catalog.counts.title[title],
    sql: "SELECT * FROM quotes WHERE title = ? AND title_seq = ?",
    args: [title],
  };
  return { count: catalog.lines, sql: "SELECT * FROM quotes WHERE seq = ?", args: [] };
}

function queryForSelection(selected, title, position) {
  if (!selected.groups) return { sql: selected.sql, args: [...selected.args, position] };
  for (const group of selected.groups) {
    if (position < group.count) {
      return title
        ? { sql: "SELECT * FROM quotes WHERE operator_id = ? AND title = ? AND operator_title_seq = ?", args: [group.id, title, position] }
        : { sql: "SELECT * FROM quotes WHERE operator_id = ? AND operator_seq = ?", args: [group.id, position] };
    }
    position -= group.count;
  }
  throw new Error("Catalog selection index is inconsistent");
}

async function handleApi(request, env, url) {
  const { pathname, searchParams } = url;
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      },
    });
  }
  if (request.method !== "GET" && request.method !== "HEAD") {
    return json(request, 405, { error: "method_not_allowed" });
  }
  if (pathname === "/api/v1/status") {
    await env.DB.prepare("SELECT 1 FROM quotes LIMIT 1").first();
    return json(request, 200, {
      status: "ok", lines: catalog.lines, operators: catalog.operators.length,
      portraits: Object.keys(images.portraits).length,
      wallpapers: 0, imported_at: catalog.imported_at, source: catalog.source,
    }, "public, max-age=60");
  }
  if (pathname === "/api/v1/operators") {
    const rawLimit = first(searchParams, "limit") || "50";
    if (!/^-?\d+$/.test(rawLimit)) return json(request, 400, { error: "invalid_limit" });
    const limit = Math.min(Math.max(Number(rawLimit), 1), 200);
    const query = first(searchParams, "q").toLocaleLowerCase();
    const data = catalog.operators.filter((item) => item.name.toLocaleLowerCase().includes(query)).slice(0, limit);
    return json(request, 200, { data });
  }
  if (pathname === "/api/v1/categories") {
    return json(request, 200, { data: catalog.categories }, "public, max-age=3600");
  }
  if (pathname === "/api/v1/quotes/random" || pathname === "/api/v1/quotes/today") {
    const operator = first(searchParams, "operator");
    const title = first(searchParams, "title");
    const selected = quoteSelection(operator, title);
    if (!selected?.count) return json(request, 404, { error: "no_matching_quote", message: "没有找到符合条件的台词" });
    const day = pathname.endsWith("/today") ? shanghaiDate() : "";
    const position = await choosePosition(selected.count, day ? `${day}|${operator}|${title}` : "");
    const query = queryForSelection(selected, title, position);
    const row = await env.DB.prepare(query.sql).bind(...query.args).first();
    if (!row) return json(request, 503, { error: "catalog_out_of_sync", message: "台词索引与数据库不同步" });
    return json(request, 200, {
      id: row.id, content: row.content,
      operator: { id: row.operator_id, name: row.operator_name },
      title: row.title, edition: "CN", date: day || null,
      source: catalog.source, illustration: imageFor(row.operator_id),
    });
  }
  if (pathname === "/api/v1/wallpapers/random") {
    const orientation = first(searchParams, "orientation");
    if (orientation && orientation !== "horizontal" && orientation !== "vertical") {
      return json(request, 400, { error: "invalid_orientation" });
    }
    return json(request, 503, { error: "wallpaper_catalog_unavailable", message: "尚无可公开使用的壁纸素材" });
  }
  return json(request, 404, { error: "not_found" });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith("/api/")) return env.ASSETS.fetch(request);
    try {
      return await handleApi(request, env, url);
    } catch (error) {
      console.error("Arkoto API failure", error);
      return json(request, 503, { error: "service_unavailable" });
    }
  },
};
