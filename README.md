# 通讯录

EE308FZ 软件工程极限编程作业。通讯录支持账号注册与登录，以及新建、编辑、删除、搜索、收藏和分组。每位联系人可保存多项电话、邮箱、社交账号和地址。新账号从空通讯录开始，联系人和分组按账号独立存储。

## 本地运行

需要 Node.js 24 和 npm。在仓库根目录安装前后端依赖。

```sh
npm ci
```

打开两个终端，在仓库根目录分别运行下面的命令。

```sh
npm run dev:backend
```

```sh
npm run dev:frontend
```

打开 [本地通讯录](http://127.0.0.1:5173)。前端开发服务会把 `/api` 请求转发到 `127.0.0.1:3000`。如果页面提示无法载入联系人，确认后端终端仍在运行，然后点击「重试」。Windows PowerShell 如果限制运行 `npm.ps1`，可以使用 `npm.cmd` 执行同样的命令。

运行 `npm run build` 将生成 `frontend/dist/` 下的静态文件。部署时需把同源的 `/api` 请求转发给后端。

## Cloudflare 公网版

打开 [公网通讯录](https://address-book-xp-api.assignment1.workers.dev/)。前端页面和 `/api` 通过同一个 Worker 和 HTTPS 域名发布，账号和通讯录存入 D1。重新发布请参阅 [Cloudflare 手动部署指南](cloudflare/DEPLOY.md)。

## 账号与旧数据

首次使用点击「注册」，填写用户名和密码。注册成功后会登录，右上角的账号菜单可退出。密码经 scrypt 加盐派生后保存，登录使用服务端会话和 HttpOnly Cookie。账号数据位于 `backend/data/accounts.json`，各通讯录位于 `backend/data/books/`。

旧版通讯录仍位于 `backend/data/contacts.json`。要将原有联系人和分组复制到指定账号，先注册目标账号。在目标通讯录为空时停止后端，在仓库根目录运行以下命令，将 `你的用户名` 换成实际注册的用户名，然后重启后端。

```sh
npm run migrate:contacts -- 你的用户名
```

## 查找和分组

可以按姓名或联系方式搜索。号码搜索忽略常用分隔符与全半角差异，可用 `13800138000` 找到 `+86 138-0013-8000`。打开联系人后可复制每个电话或邮箱的保存值。

通过「全部分组」下拉中的「管理分组」新建、重命名或删除分组。通过联系人详情的「编辑分组」分配一个或多个分组。分组、收藏和搜索可同时使用。删除分组后，该组中的联系人仍保存在通讯录。旧版数据首次保存后会自动采用包含分组的新格式。

## Excel 导入与导出

点击「导出 Excel」下载整本通讯录。首次使用也可以导出空表作为模板。每位联系人占一行，第一行是列名，支持 `姓名`、`收藏`、`电话`、`邮箱`、`社交账号` 和 `地址`。同类型有多项时使用 `电话 1`、`电话 2` 这样的列名。填电话号码时使用文本单元格，以保留前导零。收藏填写「是」或「否」。

导入读取 `.xlsx` 文件中的第一张工作表。文件最大 5 MB，表格最多 5,000 位联系人。导入会追加联系人并跳过姓名及联系方式完全相同的条目。有无效数据时会提示对应行号。含公式的单元格请先转换为值。分组关系保存在应用数据中。

## 本地 Express API

| 请求 | 成功响应（HTTP 200） |
| --- | --- |
| `GET /api/health` | `{"status":"ok"}` |
| `GET /api/auth/session` | 返回当前账号，未登录时 `user` 为 `null` |
| `POST /api/auth/register` | 使用 `username` 和 `password` 注册并登录 |
| `POST /api/auth/login` | 使用 `username` 和 `password` 登录 |
| `POST /api/auth/logout` | 结束当前会话（HTTP 204） |
| `GET /api/contacts` | `{"contacts":[...],"groups":[...]}` |
| `POST /api/contacts` | 新建并返回联系人，至少填写一项电话 |
| `PUT /api/contacts/:id` | 更新姓名和联系方式 |
| `PATCH /api/contacts/:id/favorite` | 更新 `favorite` |
| `PUT /api/contacts/:id/groups` | 使用 `groupIds` 更新联系人所属分组 |
| `DELETE /api/contacts/:id` | 删除联系人（HTTP 204） |
| `GET /api/contacts/export` | 下载 Excel 工作簿 |
| `POST /api/contacts/import` | 接收 `.xlsx` 文件内容并返回 `imported` 和 `skipped` |
| `POST /api/groups` | 使用 `name` 新建分组 |
| `PATCH /api/groups/:id` | 使用 `name` 更新分组名称 |
| `DELETE /api/groups/:id` | 删除分组和归组关系（HTTP 204） |

联系人包含 `id`、`name`、`favorite`、`methods` 和 `groupIds`。每个分组包含 `id` 和 `name`。联系方式的 `type` 为 `phone`、`email`、`social` 或 `address`，值保存在 `value`。联系人和分组接口要求已登录。可用 `ADDRESS_BOOK_DATA_DIR` 为开发、验证或迁移指定数据目录。

## 协作

前端代码位于 `frontend/`，后端代码位于 `backend/`。每位成员用自己的 GitHub 账号提交实际完成的修改。成员从 `main` 拉取最新版本，创建功能分支，再通过 PR 互相检查和合并。提交前按本页步骤确认受影响的功能可以运行，并遵循[项目代码规范](CODE_STYLE.md)。

[课程作业原帖](https://bbs.csdn.net/topics/620593436)
