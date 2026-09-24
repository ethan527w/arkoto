const byId = (id) => document.getElementById(id);
const state = { mode: "random", timer: null };

function showPortrait(illustration) {
  const image = byId("quote-portrait");
  const source = byId("portrait-source");
  image.hidden = true;
  source.hidden = true;
  image.onload = null;
  image.onerror = null;
  image.removeAttribute("src");
  if (!illustration) return;
  image.onload = () => { image.hidden = false; source.hidden = false; };
  image.onerror = () => { image.hidden = true; source.hidden = true; };
  source.href = illustration.source;
  image.src = illustration.url;
}

function currentEndpoint() {
  const path = state.mode === "today" ? "/api/v1/quotes/today" : "/api/v1/quotes/random";
  const params = new URLSearchParams();
  const operator = byId("operator-input").value.trim();
  const title = byId("title-select").value;
  if (operator) params.set("operator", operator);
  if (title) params.set("title", title);
  return path + (params.size ? `?${params.toString()}` : "");
}

function updateEndpoint() {
  const endpoint = currentEndpoint();
  byId("api-example").textContent = endpoint;
  byId("try-api").href = endpoint;
}

async function fetchQuote() {
  const button = byId("fetch-quote");
  button.disabled = true;
  byId("quote-content").textContent = "正在接收来自泰拉的讯息……";
  showPortrait(null);
  try {
    const response = await fetch(currentEndpoint());
    const data = await response.json();
    if (!response.ok) throw new Error(data.message || "讯息暂时无法抵达，请稍后再试。");
    byId("quote-content").textContent = data.content;
    byId("quote-operator").textContent = data.operator.name;
    byId("quote-title").textContent = data.title;
    byId("quote-mode-label").textContent = state.mode === "today" ? "今日台词" : "随机台词";
    showPortrait(data.illustration);
  } catch (error) {
    byId("quote-content").textContent = error.message;
    byId("quote-operator").textContent = "—";
    byId("quote-title").textContent = "请调整筛选条件";
  } finally {
    button.disabled = false;
  }
}

async function loadOperators(query = "") {
  try {
    const response = await fetch(`/api/v1/operators?q=${encodeURIComponent(query)}&limit=30`);
    const result = await response.json();
    const datalist = byId("operator-options");
    datalist.replaceChildren(...result.data.map(({ name }) => {
      const option = document.createElement("option");
      option.value = name;
      return option;
    }));
  } catch (_) {
    // The quote endpoint will surface a useful error if the service is unavailable.
  }
}

async function loadPageData() {
  try {
    const [statusResponse, categoriesResponse] = await Promise.all([
      fetch("/api/v1/status"),
      fetch("/api/v1/categories"),
    ]);
    const status = await statusResponse.json();
    const categories = await categoriesResponse.json();
    byId("line-count").textContent = new Intl.NumberFormat("zh-CN").format(status.lines);
    byId("operator-count").textContent = new Intl.NumberFormat("zh-CN").format(status.operators);
    byId("data-updated").textContent = `数据同步时间：${new Date(status.imported_at).toLocaleString("zh-CN")}`;
    const select = byId("title-select");
    categories.data.forEach(({ title }) => {
      const option = document.createElement("option");
      option.value = title;
      option.textContent = title;
      select.append(option);
    });
  } catch (_) {
    byId("data-updated").textContent = "数据同步状态暂不可用";
  }
  await loadOperators();
  await fetchQuote();
}

byId("mode-random").addEventListener("click", () => {
  state.mode = "random";
  byId("mode-random").classList.add("active");
  byId("mode-today").classList.remove("active");
  updateEndpoint();
  fetchQuote();
});
byId("mode-today").addEventListener("click", () => {
  state.mode = "today";
  byId("mode-today").classList.add("active");
  byId("mode-random").classList.remove("active");
  updateEndpoint();
  fetchQuote();
});
byId("fetch-quote").addEventListener("click", fetchQuote);
byId("next-quote").addEventListener("click", fetchQuote);
byId("title-select").addEventListener("change", updateEndpoint);
byId("operator-input").addEventListener("input", (event) => {
  updateEndpoint();
  clearTimeout(state.timer);
  state.timer = setTimeout(() => loadOperators(event.target.value.trim()), 180);
});
byId("operator-input").addEventListener("keydown", (event) => {
  if (event.key === "Enter") fetchQuote();
});
byId("copy-api").addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(`${location.origin}${currentEndpoint()}`);
    byId("copy-api").textContent = "已复制 ✓";
    setTimeout(() => { byId("copy-api").textContent = "复制地址 ↗"; }, 1600);
  } catch (_) {
    byId("copy-api").textContent = "复制失败";
  }
});

loadPageData();
