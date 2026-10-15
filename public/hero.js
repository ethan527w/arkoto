(() => {
  const get = (id) => document.getElementById(id);
  const note = "剧情 CG 背景独立随机。";
  let generation = 0;
  let currentRequest;

  function clearImage(imageId, sourceId) {
    const image = get(imageId);
    image.hidden = true;
    image.removeAttribute("src");
    const source = get(sourceId);
    source.hidden = true;
    source.removeAttribute("href");
  }

  function showImage(imageId, sourceId, item, token, alt = "") {
    if (!item?.url) return;
    // Preload each selection separately so a late image cannot replace a newer operator.
    const preload = new Image();
    ArkotoImages.load(preload, item, { priority: "high", onload: () => {
      if (token !== generation) return;
      const image = get(imageId);
      image.alt = alt;
      image.decoding = "async";
      image.src = preload.src;
      image.hidden = false;
      if (item.source) {
        const source = get(sourceId);
        source.href = item.source;
        source.hidden = false;
      }
    } });
  }

  async function fetchJSON(path, signal) {
    const response = await fetch(path, { signal });
    if (!response.ok) throw new Error("讯息暂时无法抵达");
    return response.json();
  }

  async function refresh() {
    const token = ++generation;
    currentRequest?.abort();
    const controller = new AbortController();
    currentRequest = controller;
    const timeout = setTimeout(() => controller.abort(), 12000);
    get("hero-refresh").disabled = true;
    get("hero-status").textContent = "正在接收新的讯息……";
    clearImage("hero-portrait", "hero-portrait-source");
    // Keep the current CG visible until its replacement has loaded.
    const results = await Promise.allSettled([
      fetchJSON("/api/v1/quotes/random", controller.signal).then((quote) => {
        if (token !== generation) return;
        get("hero-quote").textContent = quote.content;
        get("hero-quote").classList.toggle("is-long", quote.content.length > 100);
        get("hero-operator").textContent = quote.operator.name;
        get("hero-title").textContent = quote.title;
        showImage("hero-portrait", "hero-portrait-source", quote.illustration, token, `${quote.operator.name}立绘`);
        requestAnimationFrame(() => {
          if (token === generation) get("hero-quote").tabIndex = get("hero-quote").scrollHeight > get("hero-quote").clientHeight ? 0 : -1;
        });
      }),
      fetchJSON("/api/v1/cg/random", controller.signal).then((result) => {
        if (token === generation) showImage("hero-background", "hero-background-source", result.data, token);
      }),
    ]);
    clearTimeout(timeout);
    if (token !== generation) return;
    get("hero-refresh").disabled = false;
    if (results[0].status === "rejected") {
      if (get("hero-operator").textContent === "—") get("hero-quote").textContent = "讯息暂时无法抵达，点右上角再试一次。";
      get("hero-status").textContent = "讯息暂未更新，可点右上角重试。";
    } else {
      get("hero-status").textContent = results[1].status === "rejected" ? "背景暂时无法抵达，可点右上角重试。" : note;
    }
  }

  get("hero-refresh").addEventListener("click", refresh);
  refresh();
})();
