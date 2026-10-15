import images from "../data/image_index.json";

const sources = {
  portraits: {
    files: new Set(Object.values(images.portraits)),
    base: "https://raw.githubusercontent.com/ArknightsAssets/ArknightsAssets2/refs/heads/cn/assets/dyn/arts/charportraits/",
  },
  cg: {
    files: new Set(images.cg),
    base: "https://raw.githubusercontent.com/Aceship/Arknight-Images/refs/heads/main/avg/images/",
  },
};
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS" };

export async function serveImage(request, context) {
  const fail = (status) => new Response(null, { status, headers: { ...cors, "Cache-Control": "no-store" } });
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (!["GET", "HEAD"].includes(request.method)) return fail(405);
  const url = new URL(request.url);
  const match = /^\/api\/v1\/images\/(portraits|cg)\/([^/]+)$/.exec(url.pathname);
  if (!match) return fail(404);
  let filename;
  try { filename = decodeURIComponent(match[2]); } catch (_) { return fail(404); }
  const source = sources[match[1]];
  if (!source.files.has(filename)) return fail(404);

  // Canonical, query-free keys prevent duplicate entries for the same indexed asset.
  const key = new Request(`${url.origin}/api/v1/images/${match[1]}/${encodeURIComponent(filename)}`);
  const cache = globalThis.caches?.default;
  let cached;
  try { cached = await cache?.match(key); } catch (_) { /* Cache outages must not hide images. */ }
  if (cached) {
    const headers = new Headers(cached.headers);
    headers.set("X-Arkoto-Cache", "HIT");
    return new Response(request.method === "HEAD" ? null : cached.body, { headers });
  }

  let upstream;
  try {
    upstream = await fetch(source.base + encodeURIComponent(filename), {
      method: request.method, signal: AbortSignal.timeout(15000), redirect: "error",
    });
  } catch (_) { return fail(502); }
  if (!upstream.ok || !/^image\/(png|jpeg|webp|avif)(;|$)/i.test(upstream.headers.get("Content-Type") || "")) {
    await upstream.body?.cancel();
    return fail(502);
  }
  const headers = new Headers({
    ...cors,
    "Content-Type": upstream.headers.get("Content-Type"),
    "Cache-Control": "public, max-age=86400, s-maxage=604800",
    "X-Content-Type-Options": "nosniff",
    "X-Arkoto-Cache": "MISS",
  });
  for (const name of ["Content-Length", "ETag", "Last-Modified"]) {
    if (upstream.headers.has(name)) headers.set(name, upstream.headers.get(name));
  }
  const response = new Response(request.method === "HEAD" ? null : upstream.body, { headers });
  if (cache && context?.waitUntil && request.method === "GET") {
    context.waitUntil(cache.put(key, response.clone()).catch(() => {}));
  }
  return response;
}
