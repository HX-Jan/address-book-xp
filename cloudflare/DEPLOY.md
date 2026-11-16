# 在 Cloudflare 手动部署通讯录

需要 Node.js 24、npm 和一个已开通 Workers 与 D1 的 Cloudflare 账号。以下 PowerShell 命令从完整仓库的根目录运行。部署目标为 `address-book-xp-api` Worker 和 `address-book-xp-production` D1。前端静态文件与 `/api` 使用相同的 HTTPS 域名。仓库根目录的 `wrangler.jsonc` 供现有 GitHub 构建使用。

## 1. 登录并创建正式数据库

```powershell
npx.cmd --yes wrangler@4.162.0 login
npx.cmd --yes wrangler@4.162.0 whoami
```

在浏览器里完成 Cloudflare 授权。确认 Wrangler 显示的是你准备部署的账号。在 Cloudflare 的 **存储和数据库 → D1** 找到正式库并复制 UUID。仅在首次搭建且该库尚不存在时，运行以下命令创建。

```powershell
npx.cmd --yes wrangler@4.162.0 d1 create address-book-xp-production --update-config=false
```

## 2. 填写部署配置

```powershell
$configPath = 'cloudflare/wrangler.production.jsonc'
if (-not (Test-Path -LiteralPath $configPath)) {
    Copy-Item cloudflare/wrangler.production.jsonc.example $configPath
}
notepad.exe $configPath
```

将 `REPLACE_WITH_PRODUCTION_D1_DATABASE_ID` 换成上一步的正式库 UUID，保存文件。若已有正式配置，请核对 UUID，并将模板中的 `assets` 设置补入配置。正式配置存放在本机。

## 3. 打包、初始化并发布

按顺序逐条执行。遇到报错时先处理该步，再运行下一条。

```powershell
npm.cmd ci
npm.cmd run build
npx.cmd --yes wrangler@4.162.0 deploy --dry-run --config $configPath
npx.cmd --yes wrangler@4.162.0 d1 info DB --config $configPath
npx.cmd --yes wrangler@4.162.0 d1 migrations apply DB --remote --config $configPath
npx.cmd --yes wrangler@4.162.0 deploy --config $configPath
```

先核对 `d1 info` 返回的远程库名称为 `address-book-xp-production`，再确认执行迁移。重新部署时 Wrangler 只应用未执行的迁移。如果是该 Cloudflare 账号首次使用 `workers.dev`，根据提示设置账号的子域名。部署后复制终端输出的 HTTPS 地址。

## 4. 验收

把第一行换成你的实际地址，末尾不带斜杠。

```powershell
$url = 'https://address-book-xp-api.<你的子域名>.workers.dev'
curl.exe -I "$url/"
curl.exe -i "$url/api/health"
curl.exe -i "$url/api/auth/session"
curl.exe -i "$url/api/auth/salt?username=deploy_check"
curl.exe -i "$url/api/contacts"
```

| 请求 | 预期结果 |
| --- | --- |
| `HEAD /` | HTTP 200，响应类型为 HTML。 |
| `GET /api/health` | HTTP 200，返回 `{"status":"ok"}`，表示 Worker 能读取 D1 表。 |
| `GET /api/auth/session` | HTTP 200，返回 `user: null`、`passwordScheme: "pbkdf2-sha256"` 和 `workbookMode: "browser"`。 |
| `GET /api/auth/salt` | HTTP 200，返回 32 位十六进制 `salt`，同时经过认证限流。 |
| 未登录请求 `GET /api/contacts` | HTTP 401。 |

Worker 使用 HTTPS 会话 Cookie、同源写入限制和每分钟 30 次的认证入口限流。用浏览器打开首页，验收注册、登录、联系人操作及 Excel 导入导出。

- [Cloudflare D1 迁移文档](https://developers.cloudflare.com/d1/wrangler-commands/#d1-migrations-apply)
- [Cloudflare workers.dev 地址说明](https://developers.cloudflare.com/workers/configuration/routing/workers-dev/)
