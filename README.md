# 河南省非物质文化遗产共创平台（AI 共创版）

> 传智杯 · AI Web 网页开发挑战赛参赛作品
> 一个把「非遗知识 → AI 问答 → AI 拆解共创任务 → 真实发布共创项目」串成闭环的 Web 应用。

- 在线演示：本地一键启动后访问 <http://localhost:3000/>
- 演示账号：`admin` / `creator` / `designer` / `user`，密码均为 `123456`

---

## 一、项目简介

河南拥有海量非物质文化遗产，但公众"看得见、看不懂、参与不了"，传承人"有手艺、缺设计、缺渠道"。
本项目做了三件事：

1. **把非遗讲清楚**：49 个非遗项目、18 位代表性传承人、10 大分类，配真实照片、工艺流程、历史源流与体验指南。
2. **让 AI 真的懂这些内容**：自建知识库 + BM25 检索增强（RAG），AI 回答**必须带检索依据**，不编造。
3. **把"想参与"变成"能落地"**：AI 共创 Agent 会查项目、查传承人、查已有作品，然后**拆任务、出方案**，
   一键发布成真实的共创项目，设计师可以在平台内申请加入、领任务、交成果。

## 二、技术架构

```
┌───────────────────────────── 浏览器（原生 HTML / CSS / JS，无构建）─────────────────────────────┐
│  页面层   index / projects / project-detail / co-projects / co-project-detail / ai-chat / ai-lab  │
│  组件层   script.js(头部/页脚/封面组件) co-common.js(共创组件)  ai-chat.js  ai-lab.js              │
│  AI 客户端 ai-client.js（fetch + SSE 解析）   vision-search.js（端侧视觉特征，图片不出浏览器）        │
└───────────────────────────────────────┬──────────────────────────────────────────────────────┘
                                        │ 同源 HTTP / SSE
┌───────────────────────────────────────┴──────────────────────────────────────────────────────┐
│ 服务层  Node.js 20 + Express 4                                                                │
│   routes/   auth users heritage projects works community admin ai upload                       │
│   services/ ai.service（问答/流式/文案）  rag.service（BM25 检索）  agent.service（工具+规划）     │
│             knowledge.service（无大模型兜底）  guard.service（输入拦截/输出标识）                  │
│   repos/    heritage project work social user（SQL 只出现在这一层）                              │
│   db/       better-sqlite3（WAL） + bootstrap 首次自动灌数据                                     │
└───────────────────────────────────────┬──────────────────────────────────────────────────────┘
                                        │
                        通义千问 DashScope（可选，配置 QWEN_API_KEY 即启用；未配置自动降级本地知识库）
```

**关键设计取舍**（答辩可讲）：

| 取舍 | 原因 |
|---|---|
| 后端同时托管前端静态文件 | 前后端同源，彻底避免 CORS/"连不上后端"，评审打开一个地址就能跑 |
| 不用向量库，用 BM25 | 知识库只有几百个片段，BM25 零依赖、可解释、能离线跑；检索依据可原样展示给评委 |
| 没有 Key 也能演示 | 大模型不可用时走平台知识库 + 规则兜底，AI 面板不白屏（评分点：AI 可控性） |
| 端侧做多模态 | 图片特征在浏览器里算（72 维），不上传服务器，天然满足隐私要求 |

## 三、目录结构

```
1(2)/1/1/
├── 启动网站.bat / 启动网站-静默.vbs / launcher.js   # 一键启动（装依赖→灌数据→起服务→开浏览器）
├── README.md                                        # 本文件
├── 对标评分自查与改进.md                             # 对照官方评分标准的自查表
├── 快速开始.md / 7天省赛冲刺指南.md
├── backend/                                         # 后端（Express + SQLite）
│   ├── server.js          # 应用装配 + 静态托管 + 自动开浏览器
│   ├── config/            # 环境变量集中管理
│   ├── db/                # 建表 / seed / bootstrap（首次自动灌数据）
│   ├── repositories/      # SQL 层
│   ├── services/          # 业务层（含 ai / rag / agent / knowledge / guard）
│   ├── routes/            # 控制器
│   ├── docs/openapi.json  # 40+ 接口文档
│   └── .env.example
└── 算法网站(3)/            # 前端
    ├── index.html
    ├── html/              # 19 个页面
    ├── css/style.css      # 设计系统（颜色/间距/组件）
    ├── js/                # 页面脚本与可复用组件
    └── img/               # 封面、传承人照片、Logo
```

## 四、安装运行

**只想看效果（0 配置）**：直接双击 `算法网站(3)/index.html`。
浏览器不允许网页启动本地进程，所以这时网站会自动进入 **离线演示模式**：
用内置示例数据渲染共创广场 / 共创项目 / 工作台 / 活动资讯，AI 问答走页面内置知识库，
登录可用演示账号（`admin` / `creator` / `designer` / `writer` / `user`，密码 `123456`）。

**完整功能（写操作需要后端）**：双击根目录 `启动网站.bat`
→ 自动完成：检查 Node → 安装依赖 → 生成 `.env` → 首次自动导入非遗数据与演示项目 → 启动服务 → 打开浏览器。
页面每 4 秒自动探测后端，服务起来后会自动把「离线演示」切回真实数据。

**在线演示（部署后填这里）**

| 项 | 值 |
|---|---|
| 演示地址 | `（待填：https://xxx.onrender.com）` |
| 评审账号 | `reviewer` / `Reviewer@2026`（跑 `npm run reviewer` 生成/重置） |
| 演示账号 | `creator` / `123456`（可体验发布与协作） |

部署完成后跑一次自检（30 秒，9 项）：`npm run deploy:check -- https://你的域名 --with-login reviewer Reviewer@2026`

**可选：网页上的按钮直接拉起后端**（本机便利，需一次性安装）
双击 `tools/安装一键启动.cmd` 注册 `ich://` 协议 → 之后在网页「离线演示」提示里点「一键启动后端」即可。
只写 `HKEY_CURRENT_USER`，可用 `tools/卸载一键启动.cmd` 卸载；换台电脑不生效，所以提交材料仍需在线演示地址 + 视频。详见 `tools/README.md`。

**手动**：

```bash
cd backend
npm install
cp .env.example .env      # Windows: copy .env.example .env
npm start                 # 首次启动自动灌数据；访问 http://localhost:3000/
```

环境变量（`backend/.env`，模板见 `.env.example`）：

| 变量 | 说明 |
|---|---|
| `PORT` | 服务端口，默认 3000 |
| `JWT_SECRET` | **必须修改**为 32 位以上随机串 |
| `QWEN_API_KEY` | 可选。填入后 AI 走通义千问；不填走平台知识库 |
| `AUTO_OPEN_BROWSER` | 启动后是否自动开浏览器，默认 1 |
| `AUTO_SETUP` | 首次是否自动灌数据，默认 1 |

> ⚠️ `.env` 已在 `.gitignore` 中，**密钥不会进入仓库**。

## 五、AI 能力一览（对应评分点）

| 能力 | 入口 | 实现 |
|---|---|---|
| 流式问答 + 检索依据 | `/html/ai-chat.html` | `POST /api/ai/chat/stream`（SSE）→ `rag.service` 检索 → 大模型/本地兜底 → 逐字渲染 + 引用 |
| AI 共创 Agent（5 工具） | `/html/ai-lab.html` | `POST /api/ai/agent/stream` → `agent.service` 规划并真实调用工具，步骤实时推送 |
| **MCP 协议端点** | `POST /api/mcp` | JSON-RPC 2.0：`initialize` / `tools/list` / `tools/call`，任意 MCP 客户端可接入 |
| 以图搜非遗（端侧多模态） | `/html/ai-lab.html` | `vision-search.js`：Canvas → 72 维特征 → 归一化距离 → top-k |
| **纹样生成（多模态输出）** | `/html/ai-lab.html` | `pattern-generator.js`：取项目配色 → 四方连续 / 团花 / 折枝 → 可下载 PNG，同种子可复现 |
| 语音提问 | `/html/ai-chat.html` 麦克风 | Web Speech API |
| AI 文案 / 纹样建议 | 作品投稿、共创项目页 | `POST /api/ai/work-desc`、`/api/ai/pattern-idea` |
| 工具清单（Function Calling schema） | `GET /api/ai/tools` | `agent.service.TOOLS` |

## 六、开发与质量

```bash
npm install          # 安装开发依赖（eslint / prettier）
npm run lint         # ESLint：前端 js + 后端 + launcher（当前 0 错误 0 告警）
npm run format:check # Prettier 校验新增模块格式
npm test             # 后端单测（20 个：RAG 检索 / 安全闸门 / Agent 编排）
npm run check        # lint + format + typecheck + test 一把跑完
npm run verify       # 8 项提交前自检（页面引用/规范/类型/单测/评测/PDF/接口）
npm run a11y:md      # 可访问性审计（20 页）→ docs/a11y-report.md
npm run shots        # 录屏素材：12 张 1080p 分镜截图 → docs/shots/
npm run pdf          # 技术文档 PDF（16 页，自动校验 ≤30 页）
npm run reviewer     # 创建/重置评审专用账号
npm run pre-submit   # 提交前检查：7 项必做逐条判定（哪些还没弄）
npm run fill -- --school 学校 --group "B 组" --members "甲、乙" --teacher 老师 --repo <仓库> --demo <地址>   # 一键替换所有『待填写』
```

> 说明：前端是**零构建**的原生 JS（部署时不需要 webpack/vite，评审拉下来就能跑）。
> 我们通过 ESLint 规则约束质量，并在 `.eslintrc.json` 里说明了"前端脚本按顺序加载、跨文件共享全局"的取舍。

## 七、接口文档

- Swagger UI：<http://localhost:3000/api-docs>
- OpenAPI 文件：`backend/docs/openapi.json`（40+ 接口）
- MCP 端点自述：<http://localhost:3000/api/mcp>

## 八、其他文档

| 文档 | 用途 |
|---|---|
| `对标评分自查与改进.md` | 逐条对照官方评分标准的自查表（两轮改进记录 + 评委问答） |
| `商业计划与价值主张.md` | 商业模式、单位经济模型、市场规模、风险对策 |
| `演示视频脚本.md` | 6 分 30 秒分镜 + 录屏检查清单 |
| `deploy/README.md` | Render / Docker / Nginx（含 SSE 不缓冲）部署说明 |

## 九、团队信息

| 项目 | 内容 |
|---|---|
| 学校 | （待填写） |
| 组别 | （B 组 / C 组，按官方规则自选） |
| 队员 | （待填写） |
| 指导老师 | （待填写） |

## 十、声明

- 非遗文字资料依据公开资料整理，用于教学与竞赛演示；传承人信息为示范性展示。
- 封面照片来自公开图库/平台自有素材；如涉及版权请联系替换。
- AI 生成内容均带标识，仅供参考。

## 九、许可

MIT
