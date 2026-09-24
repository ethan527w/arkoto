# 将 Arkoto 部署到 Cloudflare

Arkoto 使用一个 Cloudflare Worker 同时提供静态网页与 API，D1 保存台词。**不需要 VPS**。下面的步骤会创建公开可访问的服务；部署前先确认《明日方舟》文字和图片的使用范围。

## 1. 准备本地数据

在项目根目录运行：

```bash
npm ci
python3 -m scripts.import_data --download
python3 -m scripts.export_d1
```

这会生成 `data/generated/arkoto-d1.sql`（含游戏台词）和 `data/catalog_index.json`（查询索引，不含台词正文）。前者被 `.gitignore` 排除，**不要手动上传到公开 GitHub 仓库**。

## 2. 登录并创建 D1

```bash
npx wrangler login
npx wrangler d1 create arkoto
```

第二个命令会给出数据库 ID。把 `wrangler.jsonc` 中的 `00000000-0000-0000-0000-000000000000` 换成真实 ID；如 Wrangler 问是否自动添加 binding，已有 `DB` binding 时不要重复添加。先确认操作的是自己的 Cloudflare 账户。

## 3. 导入并部署

```bash
npx wrangler d1 execute arkoto --remote --file=data/generated/arkoto-d1.sql --yes
npx wrangler d1 execute arkoto --remote --command='SELECT COUNT(*) AS total FROM quotes;'
npm run deploy
```

导入完成后应看到 **18,237** 行左右（以后随国服数据更新）。部署命令会输出一个 `*.workers.dev` 地址，先检查 `/api/v1/status` 和网页。Cloudflare 的 [D1 导入文档](https://developers.cloudflare.com/d1/best-practices/import-export-data/)说明了 `d1 execute --file` 的工作方式。

> [!CAUTION]
> 导出的 SQL 会先删除旧 `quotes` 表，再重新导入。初次部署可直接使用；以后更新公开服务前，应先用 `npx wrangler d1 export arkoto --remote --output=data/generated/backup.sql` 备份，并安排维护窗口。更新索引后还需要重新 `npm run deploy`，保持 Worker 索引和 D1 数据同步。

## 4. 绑定 `arkoto.me`

域名可在 GoDaddy 购买。买好后：

1. 在 Cloudflare 添加 `arkoto.me` 站点，记下 Cloudflare 分配的两个 nameserver。
2. 到 GoDaddy 把域名 nameserver 改为这两个地址，等待 Cloudflare 显示站点已激活。操作参考 [Cloudflare 域名接入文档](https://developers.cloudflare.com/dns/zone-setups/full-setup/setup/)。
3. 在 Cloudflare 的 **Workers & Pages → Arkoto Worker → Settings → Domains & Routes → Add → Custom Domain** 添加 `arkoto.me`。Cloudflare 会创建所需 DNS 记录并申请 HTTPS 证书；参考 [Custom Domains 文档](https://developers.cloudflare.com/workers/configuration/routing/custom-domains/)。

如果之后还要 `www.arkoto.me`，可再添加一个 Custom Domain 并决定是否重定向到主域名。

## 上线前检查

- **内容权利**：确认台词、立绘、CG 的公开展示和 API 再分发范围。
- **访问控制**：为公开 API 制定限流策略，避免被大量请求耗尽免费额度。
- **监控与备份**：关注 Workers 错误率、D1 用量，并定期备份数据库。
- **图片来源**：现在返回的是第三方 GitHub Raw URL；在目标用户地区验证可访问性，不要把它当作有 SLA 的图片 CDN。

当前数据量约 5 MB，低于 [D1 免费计划的 500 MB 单库上限](https://developers.cloudflare.com/d1/platform/limits/)。当前导出包含 18,237 条台词与 3 个查询索引；首次导入估算约 73,000 行写入，低于 [D1 免费计划每日 100,000 行写入](https://developers.cloudflare.com/d1/platform/pricing/)额度，但实际值应以导入时的用量记录为准。同一天重复全量导入可能超额。Workers 免费计划还有每日 100,000 次请求、D1 每日 500 万行读取上限；超额后服务可能报错，详见 [Workers 限额](https://developers.cloudflare.com/workers/platform/limits/)与 [D1 价格](https://developers.cloudflare.com/d1/platform/pricing/)。
