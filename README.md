# 通讯录

EE308FZ 软件工程极限编程作业的前后端骨架。浏览器通过 HTTP API 读取联系人列表。当前数据源为空，后续迭代可以接入持久化。

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

打开 [本地通讯录](http://127.0.0.1:5173)。前端开发服务会把 `/api` 请求转发到 `127.0.0.1:3000`。如果页面提示连接失败，确认后端终端仍在运行，然后点击「重试」。Windows PowerShell 如果限制运行 `npm.ps1`，可以使用 `npm.cmd` 执行同样的命令。

运行 `npm run build` 将生成 `frontend/dist/` 下的静态文件。部署时需把同源的 `/api` 请求转发给后端。

## 接口

| 请求 | 成功响应（HTTP 200） |
| --- | --- |
| `GET /api/health` | `{"status":"ok"}` |
| `GET /api/contacts` | `{"contacts":[]}` |

联系人列表中的条目包含字符串类型的 `id` 和 `name`。列表为空时，界面显示「暂无联系人」。

## 协作

前端代码位于 `frontend/`，后端代码位于 `backend/`。每位成员用自己的 GitHub 账号提交实际完成的修改。成员从 `main` 拉取最新版本，创建功能分支，再通过 PR 互相检查和合并。提交前按本页步骤确认受影响的功能可以运行，并遵循[项目代码规范](CODE_STYLE.md)。

[课程作业原帖](https://bbs.csdn.net/topics/620593436)
