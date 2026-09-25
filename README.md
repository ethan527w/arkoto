![Arkoto — Terra in Words](docs/banner.svg)

<div align="center">

**让一句来自泰拉的台词，出现在你的网站、机器人或桌面。**

《明日方舟》干员语音文本、对应立绘与剧情 CG 索引的非官方 API 项目。

[在线体验](https://arkoto.me/) · [网页接口文档](https://arkoto.me/docs) · [服务状态](https://arkoto.me/api/v1/status)

[开始调用](#开始调用) · [接口总览](#接口总览) · [台词接口](#台词接口) · [本地运行](#本地运行)

</div>

> [!NOTE]
> Arkoto 是玩家项目，与《明日方舟》及其运营方无关。台词和图片的权利归原权利人；公开可访问的社区镜像不等于使用授权。

## 项目概览

Arkoto 提供公开读取的 JSON 接口：随机台词、按北京时间固定的「今日台词」、干员和场景查询、随机剧情 CG 链接。台词响应附带对应干员的立绘信息；剧情 CG 与台词没有可靠的一一对应关系，因此使用独立接口。

| 仓库索引快照（2026-09-24） | 数量 |
| --- | ---: |
| 台词 | 18,237 条 |
| 有台词的干员 ID | 435 个 |
| 剧情 CG 文件索引 | 829 个 |

线上数量请以 [`/api/v1/status`](https://arkoto.me/api/v1/status) 为准。仓库只保存代码与轻量索引，不提交游戏台词数据库或图片文件。

## 开始调用

生产 API 根地址按项目配置为 `https://arkoto.me/api/v1`。当前可用接口均为 **GET**，返回 JSON，无需 API 密钥，并允许跨域读取。最简单的一次调用：

```bash
curl -sS 'https://arkoto.me/api/v1/quotes/random'
```

返回 JSON 中，`content` 是台词，`operator.name` 是干员名，`title` 是台词场景。下面是在网页中按干员和场景获取「今日台词」的完整例子；页面需有一个 `<p id="quote"></p>` 元素：

```js
const url = new URL("https://arkoto.me/api/v1/quotes/today");
url.searchParams.set("operator", "阿米娅");
url.searchParams.set("title", "任命助理");

const response = await fetch(url);
const result = await response.json();
if (!response.ok) {
  throw new Error(result.message || result.error || response.statusText);
}

document.querySelector("#quote").textContent =
  result.content + " —— " + result.operator.name;
```

`URLSearchParams` 会正确编码中文。不要直接把未经编码的中文或特殊字符拼进 URL。Python 标准库调用示例：

```python
import json
from urllib.parse import urlencode
from urllib.request import urlopen

params = urlencode({"operator": "阿米娅", "title": "任命助理"})
url = f"https://arkoto.me/api/v1/quotes/random?{params}"

with urlopen(url, timeout=10) as response:
    quote = json.load(response)

print(quote["content"], "——", quote["operator"]["name"])
```

## 接口总览

| 路径 | 作用 | 查询参数 |
| --- | --- | --- |
| `GET /api/v1/quotes/random` | 从符合条件的台词中随机返回一条 | `operator`、`title`，均可选 |
| `GET /api/v1/quotes/today` | 同一天、同一筛选条件返回固定台词 | `operator`、`title`，均可选 |
| `GET /api/v1/operators` | 搜索干员 | `q`、`limit`，均可选 |
| `GET /api/v1/categories` | 列出台词场景与数量 | 无 |
| `GET /api/v1/cg/random` | 随机返回一张剧情 CG 的图片链接 | 无 |
| `GET /api/v1/status` | 返回服务和数据索引状态 | 无 |
| `GET /api/v1/wallpapers/random` | 壁纸预留接口；公开 Worker 当前返回 503 | `orientation`，可选 |

接口路径区分大小写。Worker 的 API 还支持 `HEAD` 和 `OPTIONS`；`OPTIONS` 返回 204。响应允许跨域读取，成功结果的 `Content-Type` 为 `application/json; charset=utf-8`。

## 台词接口

### 随机台词

```bash
curl -sS --get 'https://arkoto.me/api/v1/quotes/random' \
  --data-urlencode 'operator=阿米娅' \
  --data-urlencode 'title=任命助理'
```

### 今日台词

将路径改为 `/quotes/today`。日期按 **Asia/Shanghai（北京时间）** 计算；同一天、同一筛选条件在同一数据快照上会选出同一条。数据更新后结果可能改变。

```bash
curl -sS --get 'https://arkoto.me/api/v1/quotes/today' \
  --data-urlencode 'operator=char_002_amiya' \
  --data-urlencode 'title=任命助理'
```

| 参数 | 规则 | 示例 |
| --- | --- | --- |
| `operator` | 干员名称或 ID，精确匹配；不传则不限干员 | `阿米娅` 或 `char_002_amiya` |
| `title` | 台词场景名称，精确匹配；不传则不限场景 | `任命助理` |

两个参数可单独或组合使用。服务器会去掉参数首尾空白，并截取前 100 个字符。筛选无结果时返回 `404 no_matching_quote`。

以下是从仓库当前 SQLite 数据与立绘索引核对过的一条**可能的随机结果**；随机接口不保证每次选中它：

```json
{
  "id": "char_002_amiya_CN_001",
  "content": "博士，您工作辛苦了。",
  "operator": {
    "id": "char_002_amiya",
    "name": "阿米娅"
  },
  "title": "任命助理",
  "edition": "CN",
  "date": null,
  "source": "https://github.com/ArknightsAssets/ArknightsGamedata",
  "illustration": {
    "type": "operator_portrait",
    "url": "https://raw.githubusercontent.com/ArknightsAssets/ArknightsAssets2/refs/heads/cn/assets/dyn/arts/charportraits/char_002_amiya_2.png",
    "source": "https://github.com/ArknightsAssets/ArknightsAssets2/tree/cn/assets/dyn/arts/charportraits",
    "filename": "char_002_amiya_2.png"
  }
}
```

| 字段 | 含义 |
| --- | --- |
| `id`、`content` | 台词 ID 与正文 |
| `operator.id`、`operator.name` | 干员 ID 与名称 |
| `title`、`edition` | 台词场景与数据版本；目前 `edition` 为 `CN` |
| `date` | 随机接口为 `null`；今日接口为北京时间的 `YYYY-MM-DD` |
| `source` | 台词数据来源 |
| `illustration` | 对应干员立绘对象；缺图时为 `null` |

`illustration.url` 是外部图片链接，`illustration.source` 是来源目录。图片由第三方托管，Arkoto 不保证外部链接始终可用。

## 查询干员与场景

### 干员搜索

`q` 对干员名称做不区分大小写的包含匹配。不传 `q` 会返回列表开头的结果。`limit` 默认 50，范围为 1–200；超出范围会收敛到边界，非整数值返回 `400 invalid_limit`。

```bash
curl -sS --get 'https://arkoto.me/api/v1/operators' \
  --data-urlencode 'q=阿米娅' \
  --data-urlencode 'limit=10'
```

当前索引中，上述查询会返回：

```json
{
  "data": [
    {
      "id": "char_002_amiya",
      "name": "阿米娅",
      "line_count": 110
    }
  ]
}
```

`id` 可直接作为台词接口的 `operator` 参数。

### 台词场景

```bash
curl -sS 'https://arkoto.me/api/v1/categories'
```

返回的 `data` 数组中，每项都有 `title` 和 `line_count`。`title` 可以直接用于台词接口的同名参数。当前索引中 `任命助理` 的 `line_count` 为 483；实际场景和数量以接口为准。

## 剧情 CG 与状态

```bash
curl -sS 'https://arkoto.me/api/v1/cg/random'
curl -sS 'https://arkoto.me/api/v1/status'
```

`/cg/random` 返回一个 `data` 对象，包含 `type`（`story_cg`）、`url`、`source` 和 `filename`。`url` 是第三方 GitHub Raw 图片链接。CG 是独立图库，不表示它对应某条台词或某位干员。

`/status` 返回 `status`、`lines`、`operators`、`portraits`、`story_cg`、`wallpapers`、`imported_at` 和 `source`。`imported_at` 是数据导入时间，不是请求时间。

`/wallpapers/random` 是预留路径。公开 Worker 当前无壁纸库：合法请求返回 `503 wallpaper_catalog_unavailable`；`orientation` 只接受 `horizontal` 或 `vertical`，其他值返回 `400 invalid_orientation`。本地 Python 服务若配置 `data/wallpapers.json`，行为可能不同。

## 错误与缓存

调用时先检查 HTTP 状态码，再解析 JSON。错误响应至少含 `error`，部分还含可读的 `message`。

| HTTP 状态 | `error` | 常见原因 |
| --- | --- | --- |
| 400 | `invalid_limit`、`invalid_orientation` | 查询参数格式不符合要求 |
| 404 | `no_matching_quote`、`not_found` | 台词筛选无结果，或路径不存在 |
| 405 | `method_not_allowed` | 使用了不支持的请求方法 |
| 503 | `catalog_out_of_sync`、`cg_catalog_unavailable`、`wallpaper_catalog_unavailable`、`service_unavailable` | 数据索引不同步、资源不可用或服务异常 |

公开 Worker 对 `/status` 设置 `Cache-Control: public, max-age=60`，对 `/categories` 设置 `public, max-age=3600`；其他当前接口为 `no-store`。客户端请处理超时、非 2xx 响应与外部图片加载失败。

## 本地运行

需要 **Python 3.12+**。本地预览不需要 Python 第三方依赖。首次从上游下载原始国服数据并导入：

```bash
git clone https://github.com/ethan527w/arkoto.git
cd arkoto
python3 -m scripts.import_data --download
python3 server.py
```

默认网页为 `http://127.0.0.1:8765/`，API 根地址为 `http://127.0.0.1:8765/api/v1`。将上述示例中的域名换为本地地址即可验证。已有 `data/raw/` 下的原始 JSON 时可省略 `--download`。重新导入后需重启服务。

本地模拟 Cloudflare Worker 与 D1：

```bash
npm ci
python3 -m scripts.export_d1
npx wrangler d1 execute arkoto --local --file=data/generated/arkoto-d1.sql --yes
npm run dev
```

Worker 本地开发默认地址为 `http://127.0.0.1:8787/`；首次运行前仍需完成原始数据导入。完整步骤见 [Cloudflare 部署指南](docs/cloudflare.md)。

## 数据来源与项目结构

- 台词和干员名：[ArknightsGamedata](https://github.com/ArknightsAssets/ArknightsGamedata) 国服数据。
- 干员立绘文件名：[ArknightsAssets2](https://github.com/ArknightsAssets/ArknightsAssets2/tree/cn/assets/dyn/arts/charportraits)。
- 剧情 CG 文件名：[Aceship/Arknight-Images](https://github.com/Aceship/Arknight-Images/tree/main/avg/images)。

`data/raw/`、`data/generated/` 与本地 `data/wallpapers.json` 均被 Git 忽略。仓库保存代码与轻量索引，不打包游戏图片或台词数据库。[视觉标识与配色](docs/brand.md) 可用于网站和演示材料。

```text
arkoto/       本地 SQLite 数据导入与查询
src/          Cloudflare Worker API
public/       网站与 API 文档页面
scripts/      数据导入、D1 导出与图片索引更新
data/         可提交的索引与本地生成数据目录
docs/         品牌视觉与部署说明
tests/        数据导入与图片索引测试
```

> [!IMPORTANT]
> 公开展示或再分发游戏台词、立绘和 CG 前，应核实具体使用范围。外部社区镜像可访问，不等于取得素材使用授权。项目还需要根据公开访问量制定限流、监控与备份方案。

## 开发验证

```bash
python3 -m unittest discover -s tests -v
python3 -m py_compile server.py arkoto/*.py scripts/*.py
node --check public/app.js
node --check src/worker.js
```
