(() => {
  const get = (id) => document.getElementById(id);
  const state = { mode: "today", request: null, operatorOptions: null };
  const modes = ["today", "date", "operator"];
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date());
  get("birthday-date").value = ["year", "month", "day"].map((key) => parts.find((part) => part.type === key).value).join("-");

  function element(tag, text, className) {
    const node = document.createElement(tag);
    if (text) node.textContent = text;
    if (className) node.className = className;
    return node;
  }

  function card(item) {
    const article = element("article", "", "birthday-card");
    const art = element("div", "", "birthday-art");
    const fallback = element("span", item.illustration ? "立绘暂时无法加载" : "暂无对应立绘");
    if (item.illustration) {
      const image = element("img");
      image.alt = `${item.operator.name}立绘`;
      image.loading = "lazy";
      image.addEventListener("error", () => art.replaceChildren(fallback), { once: true });
      image.src = item.illustration.url;
      art.append(image);
    } else art.append(fallback);
    const info = element("div", "", "birthday-card-info");
    info.append(element("h3", item.operator.name), element("p", item.birthday.text), element("small", item.operator.id));
    for (const [label, href] of [["查看立绘 ↗", item.illustration?.url], ["档案数据 ↗", item.source], ["立绘来源 ↗", item.illustration?.source]]) {
      if (!href) continue;
      const link = element("a", label);
      link.href = href;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      info.append(link);
    }
    article.append(art, info);
    return article;
  }

  async function loadOperatorOptions() {
    if (state.operatorOptions) return;
    try {
      const response = await fetch("/api/v1/birthdays");
      if (!response.ok) return;
      const result = await response.json();
      state.operatorOptions = result.data;
      get("birthday-operators").replaceChildren(...[...new Set(result.data.map((item) => item.operator.name))].map((name) => {
        const option = element("option");
        option.value = name;
        return option;
      }));
    } catch (_) { /* Exact names and IDs remain usable without autocomplete. */ }
  }

  async function loadBirthdays() {
    state.request?.abort();
    const controller = new AbortController();
    state.request = controller;
    get("birthday-submit").disabled = false;
    const mode = state.mode;
    const url = new URL(mode === "today" ? "/api/v1/birthdays/today" : "/api/v1/birthdays", location.origin);
    if (mode === "date") {
      const date = get("birthday-date").value;
      if (!date) { get("birthday-message").textContent = "请先选择日期。"; return; }
      url.searchParams.set("date", date.slice(5));
    }
    if (mode === "operator") {
      const operator = get("birthday-operator").value.trim();
      if (!operator) { get("birthday-message").textContent = "输入干员名称或 ID，查询档案中的生日。"; return; }
      url.searchParams.set("operator", operator);
    }
    get("birthday-submit").disabled = true;
    get("birthday-message").textContent = "正在读取生日档案……";
    get("birthday-results").replaceChildren();
    try {
      const response = await fetch(url, { signal: controller.signal });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || "生日档案暂时无法读取，请稍后重试。");
      if (controller.signal.aborted) return;
      get("birthday-context").textContent = mode === "today" ? `${result.date} / 北京时间` : "国服干员基础档案";
      get("birthday-results").replaceChildren(...result.data.map(card));
      if (!result.data.length) {
        get("birthday-message").textContent = mode === "operator"
          ? "没有找到这位干员的生日档案，请检查名称或 ID。"
          : "当前档案中没有这一天过生日的干员。可以换一个日期，或按干员查询。";
      } else {
        get("birthday-message").textContent = mode === "operator"
          ? `找到 ${result.data.length} 份生日档案。生日未公开时，仅展示档案原文。`
          : `${mode === "today" ? "今天" : result.date}过生日的干员，共 ${result.data.length} 位。生日快乐！`;
      }
    } catch (error) {
      if (error.name !== "AbortError") get("birthday-message").textContent = error.message;
    } finally {
      if (state.request === controller) get("birthday-submit").disabled = false;
    }
  }

  for (const mode of modes) get(`birthday-mode-${mode}`).addEventListener("click", () => {
    state.mode = mode;
    for (const value of modes) {
      get(`birthday-mode-${value}`).classList.toggle("active", value === mode);
      get(`birthday-mode-${value}`).setAttribute("aria-pressed", String(value === mode));
    }
    get("birthday-date-field").hidden = mode !== "date";
    get("birthday-operator-field").hidden = mode !== "operator";
    get("birthday-date").required = mode === "date";
    get("birthday-operator").required = mode === "operator";
    get("birthday-submit").hidden = mode === "today";
    get("birthday-context").textContent = mode === "today" ? "按北京时间查询" : "国服干员基础档案";
    get("birthday-results").replaceChildren();
    if (mode === "operator") loadOperatorOptions();
    loadBirthdays();
  });
  get("birthday-form").addEventListener("submit", (event) => { event.preventDefault(); loadBirthdays(); });
  loadBirthdays();
})();
