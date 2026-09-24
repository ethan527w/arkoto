# Arkoto

Arkoto 是一个《明日方舟》干员台词、立绘与剧情 CG 的 API 和展示页原型。它使用标准库 Python 和 SQLite，不需要安装额外依赖。项目仓库只包含代码和图片文件名索引；**游戏台词数据与图片文件不会随代码打包**。

## 运行

需要 Python 3.12 或更新版本。

```bash
python3 -m scripts.import_data --download
python3 server.py
```

打开 `http://127.0.0.1:8765/`。导入会下载约 34 MB 的 CN 游戏数据，生成约 5 MB 的本地 SQLite 数据库。如果已经把 `charword_table.json` 和 `character_table.json` 放到 `data/raw/`，可省略 `--download`。重新导入后，需要重启服务器才能读取新数据。立绘和 CG 从第三方公开镜像按需加载，浏览器需要能访问 `raw.githubusercontent.com`。

也可用 `python3 scripts/import_data.py --download`。更换端口：`python3 server.py --port 9000`。

## API

| 路径 | 用途 |
| --- | --- |
| `GET /api/v1/quotes/random` | 随机返回一条台词 |
| `GET /api/v1/quotes/today` | 按北京时间返回当日固定台词 |
| `GET /api/v1/operators?q=阿米娅&limit=20` | 查询干员；`limit` 上限为 200 |
| `GET /api/v1/categories` | 返回台词场景及数量 |
| `GET /api/v1/status` | 数据数量、来源与导入时间 |
| `GET /api/v1/cg/random` | 随机返回一张剧情 CG 的图片链接和来源 |
| `GET /api/v1/wallpapers/random` | 壁纸接口预留；当前无已授权图库时返回 503 |

台词接口接受 `operator`（干员名称或 ID）和 `title`（台词场景）筛选。参数按标准 URL 编码：

```bash
curl 'http://127.0.0.1:8765/api/v1/quotes/random?operator=%E9%98%BF%E7%B1%B3%E5%A8%85'
```

正常响应包含 `id`、`content`、`operator`、`title`、`edition`、`date`、`source` 和 `illustration`。`illustration` 是与该干员 ID 对应的立绘 URL、文件名与来源；缺图时为 `null`。没有匹配结果时返回 404。`today` 在同一份导入数据、同一天和同一组筛选条件下稳定；更新数据后可能变化。CG 作为独立图库，**不能据此推断它与某条干员语音对应**。接口允许跨域 GET，现阶段只用于本地预览，尚未配备公开服务所需的限流与监控。

## 数据和素材

台词与干员名来自社区维护的 [ArknightsGamedata](https://github.com/ArknightsAssets/ArknightsGamedata) CN 快照，具体文件是 `cn/gamedata/excel/charword_table.json` 和 `character_table.json`。`data/raw/` 与 `data/generated/` 已被 `.gitignore` 排除。导入采用临时数据库，成功后才替换旧数据库，避免失败的更新破坏当前数据。

立绘文件名索引来自 [ArknightsAssets2](https://github.com/ArknightsAssets/ArknightsAssets2/tree/cn/assets/dyn/arts/charportraits)，剧情 CG 文件名索引来自 [Aceship/Arknight-Images](https://github.com/Aceship/Arknight-Images/tree/main/avg/images)。当前索引有 461 个干员 ID 和 829 张剧情图；导入的 435 个有台词的干员 ID 都有立绘。索引位于 [`data/image_index.json`](data/image_index.json)，可用 `python3 -m scripts.update_image_index` 从公开目录刷新。网页显示图片前会提示剧情剧透。仓库不保存这些图片二进制文件；图片 URL 直接指向第三方镜像，其可用性和带宽不由 Arkoto 控制。

壁纸端点读取本机 `data/wallpapers.json`。文件格式见 [`data/wallpapers.example.json`](data/wallpapers.example.json)，每项需标明图片地址、方向和来源。当前剧情 CG 不自动当作已授权壁纸。这个原型没有托管游戏图片或配音。

**公开运营前要处理的障碍：**游戏台词、图片和配音的使用范围需要与权利人确认；社区镜像公开可访问不等于获得再分发或商用授权。日本运营方的[二次创作指引](https://www.arknights.jp/fankit/guidelines)也对直接复制游戏素材设有限制，具体适用范围需进一步核实。接着才是稳定同步、图片来源及授权记录、滥用限流、告警、备份和中国内地用户的部署方案。购买 `arkoto.me` 及上线发布由项目所有者决定。

## 验证

```bash
python3 -m unittest discover -s tests -v
python3 -m py_compile server.py arkoto/catalog.py scripts/import_data.py
node --check public/app.js
```
