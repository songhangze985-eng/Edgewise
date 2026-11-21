# 谈锋 Edgewise

谈锋 Edgewise 是一个 AI 模拟面试练习平台，同时是论文《AI 面试产品的创意营销研究——基于谈锋（Edgewise）的任务驱动机制分析》的数据采集载体。它用「承诺—体验—迁移」框架和 ZC×ZP 2×2 实验来记录用户的练习行为和问卷数据。练习评分主要基于规则，语音朗读和识别使用浏览器自带的 Web Speech API；群面支持可选的大模型接口，也有本地脚本回退。

## 功能

下面只列代码里已经能找到的功能。

**练习**
- 1v1 模拟面试：支持多轮面试，可以自定义轮数；问题分通用题和根据简历提取关键词生成的专属题；有追问、修改作答和逻辑性评分（`logic_scorer.py`）；还有反问环节和薪资谈判脚本
- 单向录制面试（`OneWayRoom`），作答录在本地
- 结构化面试（`StructuredLobby` / `StructuredRoom`）
- 群面 LGD：AI 角色参与讨论，按规则评分（`lgd_scorer.py`）
- 编程练习：Monaco 编辑器，JS 在 Web Worker 里运行，Python 通过 Pyodide 运行
- Case / 系统设计：带 Excalidraw 白板
- 在线测评：能力题和性格题（`aptitude_items.yaml`、`personality_items.yaml`）
- 一血通关挑战（`/challenge`）、定制工坊（`/studio`）

**准备与复盘**
- 简历上传解析（PDF / DOCX）、JD 解析与岗位匹配
- 题库（支持上传）、面经库（含审核队列）、STAR 故事库、准备任务页（静态生成）
- 复盘分析和单场报告，图表用 recharts；表达指标包括语速、停顿等；临场表现指标用 MediaPipe 人脸关键点在本地计算
- 面试日程，可以导出 ICS
- AI Copilot 分诊（基于规则）
- 分享卡片、结对练习（`/pair/:id`）、邀请与推荐
- 机构 / 导师视图（`/org/*`）

**研究模块**
- 知情同意、实验分组、行为事件采集、微问卷弹窗与作答接入（`MicroSurveyModal` / `surveyStore`）、7 天后测、盲评、数据导出
- 管理员问卷统计页（`/management/research`）、项目框架页（`/management/framework`）

**规划中**
- 外部语音识别：`src/api/stt.js` 目前只是占位，现在只走浏览器的 Web Speech API

## 技术栈

| 层 | 技术 |
| --- | --- |
| 前端 | React 19, Vite 8, React Router 7, Zustand 5, CSS Modules, axios, recharts, three / @react-three/fiber, Monaco, Excalidraw, @mediapipe/tasks-vision, vite-plugin-pwa |
| 后端 | FastAPI 0.115, Uvicorn, Pydantic Settings, PyJWT, bcrypt, redis-py 5（asyncio） |
| 文档解析 | pypdf, python-docx, PyYAML, jieba |
| 统计 | pandas, numpy, scipy（管理员统计用） |
| 存储 | MongoDB 文档存储与 Redis 缓存、索引、研究事件及实验计数；开发环境可降级至本地 JSON |

## 目录结构

```
.
├── index.html
├── package.json            # 前端脚本与依赖
├── vite.config.js          # 端口 3000，/api 代理到 127.0.0.1:8000，PWA
├── .env.example
├── content/tasks/          # 准备任务 Markdown 源文件
├── public/tasks/           # build-tasks 生成的静态页与 manifest
├── scripts/build-tasks.mjs # content/tasks → public/tasks + sitemap.xml
├── docs/                   # 补充说明
├── src/
│   ├── App.jsx             # 路由
│   ├── api/                # 按模块划分的 axios 封装
│   ├── components/         # Layout、Copilot、研究同意弹窗等
│   ├── config/             # experiment.js / tts.js / report.js
│   ├── features/           # 各页面（interview、lgd、coding、case、management …）
│   ├── hooks/              # useTTS、useSpeechToText、usePresence …
│   ├── research/track.js   # 前端研究事件上报
│   ├── stores/             # Zustand stores
│   └── utils/
└── backend/
    ├── run.py              # uvicorn app.main:app，0.0.0.0:8000，reload
    ├── requirements.txt
    ├── app/
    │   ├── main.py         # FastAPI 应用，启动时连接 Redis 并写入种子数据
    │   ├── config.py       # 环境变量
    │   ├── api/v1/         # 路由（统一挂在 /api/v1）
    │   ├── core/           # redis_client、security（JWT、密码哈希）
    │   ├── services/       # 业务逻辑与各评分器
    │   ├── research/       # 研究模块（事件、推导、问卷、盲评、admin_stats）
    │   ├── data/           # YAML 题库与种子数据
    │   └── models/schemas.py
    ├── scripts/generate_pdf_seed.py
    └── tests/              # pytest 用例
```

## 架构

```mermaid
flowchart LR
  B[浏览器<br/>React SPA :3000] -- /api 代理 --> A[FastAPI :8000<br/>/api/v1]
  B -. Web Speech API<br/>TTS / STT .- B
  B -. CDN 加载 .- C[MediaPipe wasm / Pyodide]
  A --> R[(Redis)]
  A --> M[(MongoDB / 本地 JSON 降级)]
  A --> S[services<br/>规则评分 / 解析]
  A --> RS[research<br/>事件 · 推导 · 问卷 · 盲评 · 统计]
  RS --> R
```

## 快速开始

准备 Node.js 20.x（至少 20.19）或 22.12 及以上版本、Python 3、Redis 和 MongoDB。项目默认连接 Redis 6379 和 MongoDB 27017。开发环境中 MongoDB 不可用时默认使用 `backend/.data/mongodb_fallback`，生产和预发布环境要求 MongoDB 可连接。恢复连接时，缺失文档会复制到 MongoDB，冲突文档保留在本地供核对。

```bash
# 1. Redis
redis-server            # 或用任意方式启动本地 Redis

# 2. 后端
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp ../.env.example .env # 然后修改 JWT_SECRET 等
python run.py           # http://localhost:8000，接口文档在 /docs

# 3. 前端（另开一个终端，在仓库根目录）
npm install
npm run dev             # http://localhost:3000，会先运行 build-tasks
```

### 前端脚本与自动化命令

| 命令 | 作用 |
| --- | --- |
| `npm run dev` | 生成任务静态页，然后启动 Vite 开发服务器（端口 3000） |
| `npm run build` | 生成任务静态页，然后执行 `vite build` |
| `npm run preview` | 预览构建产物 |
| `npm run build:tasks` | 只生成 `public/tasks` 和 `sitemap.xml` |
| `npm test` | 执行前端单元测试及项目自定义的分层检查；后者包含源码与路由静态检查，不能替代真实浏览器端到端测试 |
| `npm run test:backend` | 在临时目录运行后端测试，隔离开发数据库和本地 JSON 降级文件 |
| `npm run test:e2e` | 运行分层端到端测试（Tiers 1–4） |
| `npm run autoloop` | 运行 Agent-Autoloop 自动化管线（防腐 + QA + 实证 + UGC） |
| `npm run autoloop:check` | 验证 `.autoloop/rules.json` 规则与环境依赖 |
| `npm run autoloop:sync` | 运行 Neat-Freak 架构与文档防脑腐校验 |
| `npm run autoloop:qa` | 运行 E2E QA 守卫与自愈卡片生成器 |
| `npm run autoloop:empirical` | 运行 2×2 学术对照组均衡度与信度日常巡检 |
| `npm run autoloop:ugc` | 运行 UGC 面经隐私脱敏与 STAR 结构审核流水线 |

### 环境变量

后端变量放在 `backend/.env`，由 `app/config.py` 读取。

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `APP_ENV` | `development` | 设为 `production` 时，若仍使用占位 `JWT_SECRET` 会拒绝启动 |
| `REDIS_URL` | `redis://localhost:6379/0` | Redis 连接地址 |
| `MONGODB_URI` | `mongodb://localhost:27017` | MongoDB 连接地址 |
| `MONGODB_DB_NAME` | `edgewise` | MongoDB 数据库名称 |
| `MONGODB_STRICT_LIVE` | `false` | 设置为 `true` 时 MongoDB 不可用会阻断启动 |
| `JWT_SECRET` | 开发占位值 | **部署时必须改成强随机串**；生产环境不允许沿用占位值 |
| `JWT_ALGORITHM` | `HS256` | |
| `JWT_EXPIRE_MINUTES` | `1440` | |
| `CORS_ORIGINS` | `["http://localhost:3000","http://localhost:5173"]` | JSON 数组 |
| `RESEARCH_HASH_SECRET` | 空（为空时回退到 `JWT_SECRET`） | 研究导出伪名和管理时间线的 HMAC 密钥。同一研究期间保持稳定 |

前端和构建用的变量：

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `VITE_API_BASE` | `/api/v1` | 接口前缀；开发时由 Vite 代理到 8000 端口 |
| `EDGEWISE_SITE_ORIGIN` | `https://edgewise.app` | build-tasks 生成 sitemap 时用的域名 |

### 初始数据与管理员

后端启动时会执行 `seed_all`，写入题库、群面房间和一个演示账号（见 `backend/app/services/seed_service.py`）。演示账号带管理员权限，并且默认已同意研究。普通注册用户**不会**自动成为管理员；如需提权，请在 Redis 里把对应用户的 `is_admin` 改为 `true`，或仅保留演示管理员账号。

## API 概览

所有接口都挂在 `/api/v1` 下，除公开页面外都需要 `Authorization: Bearer <JWT>`。完整的接口定义可以在后端启动后打开 `http://localhost:8000/docs` 查看。

| 分组 | 前缀 | 主要接口 |
| --- | --- | --- |
| 认证 | `/auth` | register / login / me / logout |
| 面试 | `/interview` | sessions、score-answer、attempts、followup、revision-decision、reverse-qa、negotiation/turn、complete、research-followup |
| 群面 | `/lgd` | topics、rooms、score |
| 编程 | `/coding` | sessions、attempts、explain、complete |
| Case | `/case` | prompts、sessions、clarify、step |
| 测评 | `/assessment` | sessions、answers、complete |
| 简历 / 岗位 | `/resume`、`/jobs` | upload、jobs CRUD、`/{job_id}/match` |
| 题库 / 面经 / 故事 | `/questions`、`/experiences`、`/stories` | 列表、上传、审核、CRUD |
| 概览 / 日程 | `/dashboard`、`/schedule` | overview、recent-sessions、schedule CRUD |
| 准备任务 / 创作者 | `/tasks`、`/series` | visit / stats、系列 |
| 分享 | `/share/cards`、`/pair` | 分享卡片、结对练习 |
| 机构 | `/org` | admin/orgs、join、mentor、aggregate |
| Copilot | `/copilot` | triage、micro-done |
| 研究 | `/research` | consent、experiment、events、survey/pending、survey/answer、posttest/*、invite、referral/*、derive/daily、blind-review/*、export、export/panel |
| 研究管理 | `/research/admin` | meta、overview、passive、survey/items、experiment、crosstab、reliability、users、timeline、blind-review/progress、coding、export（仅管理员） |

## 研究模块说明

代码在 `backend/app/research/`、`backend/app/services/research_service.py` 和 `src/research/`。
数据流、恢复边界与上线前检查见 [`docs/research_data_pipeline.md`](./docs/research_data_pipeline.md)。

- **知情同意**：用户通过 `ResearchConsentModal` 和 `POST /research/consent` 同意或拒绝，当前版本号是 `2026-11-03-full`。撤回同意后会清空该用户的问卷队列（`clear_survey_on_withdraw`）。
- **实验分组**：只有同意了的用户才分组。组别是 `00 / 01 / 10 / 11` 四个之一，第一位代表 ZC（跨触点任务连续性），第二位代表 ZP（参与方式）。分配时选当前人数最少的组（`research:arm_count:*`），分好之后不再改变。各组强制开启哪些功能，见 `experiment_config.py` 和 `src/config/experiment.js` 里的 `FORCED_BY_ARM`。
- **被动数据（问卷 A）**由前端向 `POST /research/events` 上报行为事件。Redis Stream 保存事件流，MongoDB 保存原始事件、提交回执、推导指标和来源信息。带稳定事件编号的重试会复用已确认的事件。
- **主动数据（问卷 B）**由 `survey_items.yaml` 定义，通过 `GET /research/survey/pending` 下发，`POST /research/survey/answer` 收集。每次最多三题，每 24 小时最多下发两次，同题连续跳过两次后停止展示。新版客户端用下发编号关联展示与答卷，MongoDB 持久化答卷及逐题回执。
- **后测与盲评**：分组 7 天后开放后测（`/research/posttest`），14 天后有追踪任务。后测的回答进入 `research:blind_review:pool`，由评分人盲评。
- 管理统计的用户查询使用 HMAC 伪名。事件、会话和采集面板导出使用另一套共享伪名，会话和面板接口也支持显式导出原始用户 ID。日期、会话和作答内容仍可能识别个人，访问及保存规则见采集文档。
- **管理员统计**：前端页面 `/management/research`（`src/features/management/research-stats/`）有概览、被动数据、问卷、实验对比、交叉分析、信度、单用户时间线和盲评进度这几个标签页。后端接口在 `/research/admin/*`，统计依赖 pandas、numpy、scipy。页面上的统计只作探索参考，论文里的正式分析请导出后另行完成。
- 展示统计只纳入能匹配下发记录的浏览器回执。旧数据和缺少稳定编号的事件仍需核对。跨库写入中断时，能否自动恢复取决于最后一次已确认的步骤。[研究事件恢复说明](./docs/research_event_reliability_plan.md)

## 浏览器要求

- 推荐用桌面版 Chrome 或 Edge。语音朗读（`speechSynthesis`）和语音识别（`SpeechRecognition`）依赖浏览器支持；不支持的浏览器会上报 `webspeech.unsupported` 事件。
- 微信内置浏览器的语音能力有限，页面会提示用系统浏览器打开（`WeChatSpeechTip`）。
- 摄像头和麦克风需要用户授权。MediaPipe 模型和 Pyodide 首次使用时会从 CDN（jsDelivr、storage.googleapis.com）加载，离线环境下这两项功能不能用。
- 支持 PWA，`/api/*` 请求一律走网络，不缓存。

## 开发与自动化说明

- **自动化中台**：项目集成了基于数字生命卡兹克 `agent-autoloop` 架构的后台自治与人机协同系统（见 [`docs/AGENT_AUTOLOOP_INTEGRATION.md`](./docs/AGENT_AUTOLOOP_INTEGRATION.md)），支持 E2E 测试守护、Neat-Freak 文档防腐、实证数据巡检及 UGC 审核。
- 用 `npm test` 运行前端单测和分层检查，用 `npm run test:backend` 运行隔离后端测试。真实 MongoDB、Redis 恢复及浏览器流程使用研究采集验收脚本。[研究数据采集与验证](./docs/research_data_pipeline.md)
- **文档与代码防腐**：运行 `npm run autoloop:sync` 验证规范与契约一致性。
- Redis 里已有的 key 和接口只能新增、不要修改，研究数据依赖它们保持稳定。研究相关的 key 统一写在 `backend/app/research/keys.py`。
- 推导规则或题库改动后，要同步更新 `RULE_VERSION` / `SURVEY_ITEMS_VERSION`，这样统计时可以按版本筛选。
- 缺失值不能当成 0；跳过、拒答、未作答要分开记录。
- 新增准备任务：在 `content/tasks/` 里加一个 Markdown 文件，再运行 `npm run build:tasks`（见 `docs/task-pages-static.md`）。

## License

MIT License。详见仓库根目录 [LICENSE](./LICENSE)。
