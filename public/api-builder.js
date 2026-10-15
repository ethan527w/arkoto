(() => {
  const get = (id) => document.getElementById(id);
  const form = get("api-builder");
  const selected = (name) => form.elements.namedItem(name).value;
  let output = "";
  let valid = true;
  let autocompleteTimer;
  let autocompleteRequest;
  let birthdayOperators;
  const dateParts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date());
  get("builder-date").value = ["year", "month", "day"].map((key) => dateParts.find((part) => part.type === key).value).join("-");

  function update() {
    const resource = selected("resource");
    const quote = resource === "quotes";
    const birthday = resource === "birthdays";
    const lookup = resource === "operators";
    const mode = selected("birthday-mode");
    get("builder-quote-mode").hidden = !quote;
    get("builder-birthday-mode").hidden = !birthday;
    get("builder-operator-field").hidden = !(quote || birthday);
    get("builder-title-field").hidden = !quote;
    get("builder-date-field").hidden = !(birthday && mode === "date");
    get("builder-query-field").hidden = !lookup;
    get("builder-limit-field").hidden = !lookup;
    get("builder-date").disabled = !(birthday && mode === "date");
    get("builder-limit").disabled = !lookup;

    let path;
    let hint;
    valid = true;
    if (quote) {
      path = `/api/v1/quotes/${selected("quote-mode")}`;
      hint = selected("quote-mode") === "today"
        ? "按北京时间固定今日台词。同一天、同一条件、同一数据快照返回同一句。"
        : "每次随机返回一条符合条件的台词，同时附带对应干员的立绘信息。";
    } else if (birthday) {
      path = mode === "today" ? "/api/v1/birthdays/today" : "/api/v1/birthdays";
      hint = mode === "today" ? "按北京时间获取今天过生日的干员及立绘。无人生日时返回空数组。"
        : mode === "date" ? "只按月日查询，忽略年份。仅匹配档案中明确公开的生日。"
          : "留空返回全部生日档案；填入名称或 ID 可精确查询，未公开的生日保留原文。";
    } else {
      path = { cg: "/api/v1/cg/random", operators: "/api/v1/operators", categories: "/api/v1/categories", status: "/api/v1/status" }[resource];
      hint = { cg: "独立随机返回一张剧情 CG 的链接，可能包含剧透，与台词没有一一对应关系。", operators: "按名称片段查询干员；数量限制为 1 至 200 条。", categories: "返回台词场景名称与各场景数量，可将 title 用于台词筛选。", status: "查看服务状态，以及台词、立绘、剧情 CG 和生日数据的收录情况。" }[resource];
    }
    const url = new URL(path, location.origin);
    if (quote || birthday) {
      const operator = get("builder-operator").value.trim();
      if (operator) url.searchParams.set("operator", operator);
    }
    if (quote && get("builder-title").value) url.searchParams.set("title", get("builder-title").value);
    if (birthday && mode === "date") {
      const value = get("builder-date").value;
      if (value) url.searchParams.set("date", value.slice(5));
      else { valid = false; hint = "请先选择有效日期，再复制接口。"; }
    }
    if (lookup) {
      const query = get("builder-query").value.trim();
      if (query) url.searchParams.set("q", query);
      const limit = get("builder-limit").value;
      if (!/^\d+$/.test(limit) || Number(limit) < 1 || Number(limit) > 200) {
        valid = false; hint = "返回数量需要填写 1 至 200 之间的整数。";
      } else url.searchParams.set("limit", limit);
    }
    const format = selected("format");
    output = format === "curl" ? `curl '${url.href}'`
      : format === "javascript" ? `async function loadArkoto() {\n  const response = await fetch(${JSON.stringify(url.href)});\n  if (!response.ok) throw new Error(\`Arkoto: \${response.status}\`);\n  const data = await response.json();\n  console.log(data);\n  return data;\n}\n\nloadArkoto().catch(console.error);`
        : url.href;
    get("builder-output").textContent = valid ? output : "请选择有效参数。";
    get("builder-hint").textContent = hint;
    get("builder-status").textContent = "";
    get("builder-copy").textContent = { url: "复制 API 地址", curl: "复制 cURL", javascript: "复制 JavaScript" }[format];
    get("builder-copy").disabled = !valid;
    get("builder-open").setAttribute("aria-disabled", String(!valid));
    if (valid) get("builder-open").href = url.href;
    else get("builder-open").removeAttribute("href");
  }

  function setOperatorOptions(names) {
    get("builder-operators").replaceChildren(...[...new Set(names)].map((name) => {
      const option = document.createElement("option");
      option.value = name;
      return option;
    }));
  }

  async function loadOperators() {
    autocompleteRequest?.abort();
    const controller = new AbortController();
    autocompleteRequest = controller;
    const resource = selected("resource");
    try {
      if (resource === "birthdays") {
        if (!birthdayOperators) {
          const response = await fetch("/api/v1/birthdays", { signal: controller.signal });
          if (!response.ok) return;
          birthdayOperators = (await response.json()).data.map((item) => item.operator.name);
        }
        if (!controller.signal.aborted) setOperatorOptions(birthdayOperators);
      } else if (resource === "quotes") {
        const query = get("builder-operator").value.trim();
        const response = await fetch(`/api/v1/operators?q=${encodeURIComponent(query)}&limit=200`, { signal: controller.signal });
        if (!response.ok) return;
        const result = await response.json();
        if (!controller.signal.aborted) setOperatorOptions(result.data.map((item) => item.name));
      }
    } catch (_) { /* Manual entry still works when suggestions cannot be loaded. */ }
  }

  form.addEventListener("submit", (event) => event.preventDefault());
  form.addEventListener("input", update);
  form.addEventListener("change", (event) => {
    update();
    if (event.target.name === "resource") loadOperators();
  });
  get("builder-operator").addEventListener("input", () => {
    clearTimeout(autocompleteTimer);
    autocompleteTimer = setTimeout(loadOperators, 180);
  });
  get("builder-open").addEventListener("click", (event) => { if (!valid) event.preventDefault(); });
  get("builder-copy").addEventListener("click", async () => {
    if (!valid) return;
    const value = output;
    try {
      await navigator.clipboard.writeText(value);
      get("builder-status").textContent = "已复制，可以直接粘贴使用。";
    } catch (_) {
      const selection = getSelection();
      const range = document.createRange();
      range.selectNodeContents(get("builder-output"));
      selection.removeAllRanges();
      selection.addRange(range);
      get("builder-status").textContent = "内容已选中，请按 Ctrl+C 或 ⌘C 复制。";
    }
  });

  async function loadCategories() {
    try {
      const response = await fetch("/api/v1/categories");
      if (!response.ok) throw new Error("categories unavailable");
      const result = await response.json();
      for (const { title } of result.data) {
        const option = document.createElement("option");
        option.value = title;
        option.textContent = title;
        get("builder-title").append(option);
      }
    } catch (_) {
      get("builder-status").textContent = "场景选项暂未加载，可刷新重试。当前仍可生成不限定场景的接口。";
    }
  }
  update();
  loadOperators();
  loadCategories();
})();
