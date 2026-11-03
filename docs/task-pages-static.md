# 任务页静态化说明

任务内容源文件位于 `content/tasks/*.md`。构建前运行：

```bash
node scripts/build-tasks.mjs
```

或在 `npm run build` 时自动执行（见 `package.json`）。

## 产物

| 路径 | 用途 |
| --- | --- |
| `public/tasks/manifest.json` | SPA 读取任务元数据与段落 HTML |
| `public/tasks/index.html` | 任务索引静态页（爬虫可抓取） |
| `public/tasks/{slug}/index.html` | 各任务静态页，含正文与 JSON-LD（HowTo / FAQPage） |
| `public/sitemap.xml` | 站点地图 |

部署时需让 `/tasks/*` 在 SPA 路由之外可回退到上述静态 HTML，或由 CDN 直接托管 `public/tasks/`。开发模式下 Vite 会从 `public/` 提供这些文件。

## 环境变量

- `EDGEWISE_SITE_ORIGIN`：写入 canonical 与 sitemap，默认 `https://edgewise.app`

## 与实验（ZC）的关系

前端 `FORCED_BY_ARM.task_entry` 控制 ZC=1 时 CTA 预填 Lobby；ZC=0 时保留任务说明但需在大厅重新确认配置。详见 `src/config/experiment.js` 与 `InterviewLobby.jsx`。
