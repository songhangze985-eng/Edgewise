# Edgewise 与数字生命卡兹克 Agent-Autoloop 自动化体系集成指南

本指南系统阐述如何将 **数字生命卡兹克（KKKKhazix）** 开源的 **[Agent-Autoloop](https://github.com/KKKKhazix/agent-autoloop)** 自动化中台与 **[khazix-skills](https://github.com/KKKKhazix/khazix-skills)** 规范深度融合至 **谈锋（Edgewise）** 项目中。

---

## 一、 架构定位与设计哲学

在保持谈锋（Edgewise）核心产品定位与学术研究严密性的前提下，本体系采用**双层解耦设计**：

```mermaid
flowchart TD
    subgraph User_Runtime["业务运行层（前端与API服务）- 零大模型依赖 / 毫秒级规则引擎"]
        SPA["React 19 SPA (Web Speech API / MediaPipe)"]
        API["FastAPI 0.115 + Redis"]
        Scorers["规则评分器 (logic_scorer.py / lgd_scorer.py)"]
        Research["2×2 学术对照组 (ZC × ZP: 00, 01, 10, 11)"]
        SPA <--> API
        API --> Scorers
        API --> Research
    end

    subgraph Autoloop_Daemon["工程与运维层（Agent-Autoloop 自动化系统）"]
        AL_Core["Autoloop Core (轻量调度内核)"]
        AL_Rules[".autoloop/rules.json (规则引擎)"]
        
        AL_Rules --> AL_Core
        
        Job1["1. E2E QA 测试自愈 (qa-watchdog.mjs)"]
        Job2["2. 文档防腐同步 (neat-freak-sync.mjs)"]
        Job3["3. 学术实证数据巡检 (empirical-monitor.py)"]
        Job4["4. 面经与题库 UGC 审核 (ugc-reviewer.py)"]
        
        AL_Core --> Job1
        AL_Core --> Job2
        AL_Core --> Job3
        AL_Core --> Job4
        
        HITL["挂起零 Token 消耗 / 飞书 & 桌面卡片拍板 (Human-In-The-Loop)"]
        Job1 -. 异常报警 .-> HITL
        Job3 -. 样本倾斜 .-> HITL
        Job4 -. 待审预览 .-> HITL
    end
```

### 1. 业务运行层（严格保持零外部大模型依赖）
- **学术对照严密性**：Edgewise 作为《AI 面试产品的创意营销研究》实证论文的数据采集载体，必须保证 2×2（ZC×ZP）实验因子环境的绝对确定性与可复现性。评分逻辑完全基于规则与词频特征（`logic_scorer.py`、`lgd_scorer.py`）。
- **极速响应与零边际成本**：纯规则算法后端响应时间 < 50ms，且无任何商用大模型 API 调用费用。因此，**严禁将自主 Agent 侵入至终端用户的在线面试主流程中**。

### 2. 工程与运营层（全面拥抱 Agent-Autoloop 自动化）
- **后台自治循环**：工程测试、质量守卫、学术数据监控、面经题库审核均交给 Autoloop 调度。
- **挂起零消耗与人机协同（HITL）**：平时在后台静默运行，无需人工死盯终端；仅在遇到测试断言失败、样本量倾斜、敏感内容需要审核等关键决策点时，生成结构化卡片推送到飞书或桌面通知，等待人工一键拍板。

---

## 二、 四大核心自动化流水线

### 1. E2E QA 回归与自愈守卫 (`scripts/autoloop/qa-watchdog.mjs`)
- **功能**：自动运行全量 26 个单元测试及 172 个覆盖 Tiers 1–4 的 E2E 端到端测试。
- **自治机制**：
  - 测试通过时：输出绿色状态指示，系统进入挂起零消耗待机。
  - 测试失败时：自动采集堆栈与上下文，合成故障诊断 Payload，唤醒本地命令行 Agent（如 Claude Code 或 Codex）生成修复补丁，并向管理员推送带操作按钮（`Approve Patch` / `Retry` / `Discard`）的飞书审批卡片。

### 2. 架构与文档“防脑腐”同步器 (`scripts/autoloop/neat-freak-sync.mjs`)
- **理念**：贯彻卡兹克生态中的 `neat-freak` 洁癖规范，彻底消除开源项目在长期迭代中产生的“文档与代码不一致”的脑腐问题。
- **校验项**：
  - 严格核验 [PROJECT.md](file:///Users/zzz/Downloads/Edgewise/PROJECT.md) 中的 21 个功能清单（F01–F21）是否均有物理源码对应。
  - 核验 8 大 UI 原语（`Button`, `Card`, `Input`, `SegmentedControl`, `Switch`, `Badge`, `Modal`, `PageBar`）是否符合设计契约。
  - 核验 CSS Token Bridge 核心变量与向前兼容别名。
  - 核验核心路由注册完整性。

### 3. 学术实证数据与实验组均衡巡检 (`scripts/autoloop/empirical-monitor.py`)
- **功能**：面向论文数据收集的每日学术健康度审计。
- **指标**：
  - 自动读取 Redis 统计 4 组（00、01、10、11）被试样本量分布。
  - 计算随机化拟合度卡方检验统计量（$\chi^2$）与失衡比率（Imbalance Ratio）。
  - 检测实验触点流失异常，生成日报简报卡片。

### 4. 面经与题库 UGC 内容初审流水线 (`scripts/autoloop/ugc-reviewer.py`)
- **功能**：对社区用户上传的面经与题目进行全自动治理。
- **治理项**：
  - 隐私脱敏：调用 `experience_sanitize` 自动检测并脱敏手机号、邮箱、身份证与微信等私人联系方式。
  - STAR 完整度评分：结构化评估情境（Situation）、任务（Task）、行动（Action）、结果（Result）要素完整率。
  - 决策卡片：输出包含格式化预览与一键批准/打回/驳回按钮的审批卡片。

---

## 三、 快速上手与 CLI 命令

本地支持直接通过 `npm` 运行全部自动化能力，或配合全局 `agent-autoloop` 使用：

### 1. 本地独立运行
```bash
# 1. 验证 Autoloop 规则与脚本依赖
npm run autoloop:check

# 2. 运行完整自动化管线（文档防腐 + QA 守卫 + 实证巡检 + UGC 审核）
npm run autoloop

# 3. 单独运行特定管线
npm run autoloop:sync        # 架构与文档防腐校验
npm run autoloop:qa          # E2E QA 测试守护
npm run autoloop:empirical   # 学术实验数据巡检
npm run autoloop:ugc         # UGC 面经内容初审
```

### 2. 配合全局 `agent-autoloop` 守护进程使用
如果你已经在电脑上安装了数字生命卡兹克的 `agent-autoloop`：
```bash
# 查看 agent-autoloop 状态
agent-autoloop status

# 检查 Edgewise 项目内的规则配置
agent-autoloop check .autoloop/rules.json

# 将 Edgewise 规则挂入全局调度
cp .autoloop/rules.json ~/.agent-autoloop/rules.json
```

---

## 四、 持续集成（CI/CD）

本项目内置了 [`.github/workflows/autoloop-ci.yml`](file:///Users/zzz/Downloads/Edgewise/.github/workflows/autoloop-ci.yml)，在每次代码推送到 `main` 分支或发起 PR 时，GitHub Actions 会自动执行：
1. `npm run autoloop:sync`：确保文档无脑腐、契约 100% 达成。
2. `npm run autoloop:check`：核查自动化配置健康度。
3. `npm test`：执行 26 个单元测试 + 172 个 E2E 端到端测试。
4. `npm run autoloop:empirical -- --json`：验证学术数据流水线可执行性。
