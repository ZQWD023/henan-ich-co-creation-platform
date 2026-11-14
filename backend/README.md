# 河南省非遗共创平台 · 后端 API v2.0.0

> 传智杯「AI Web」赛道参赛作品后端
> 围绕 **非遗内容沉淀 + 多人协作共创 + 社区互动传播** 三大场景，以「共创」为核心差异化能力。

---

## 一、这次升级做了什么

| 模块 | 升级前 | 升级后 |
|---|---|---|
| 认证 | 只有注册/登录 | 注册/登录/改密/找回/注销 + 三角色 + 传承人认证审核 |
| 内容库 | 49 个非遗项目全在前端 `data.js` | 全部落库（23 张表），支持多条件筛选、模糊搜索、分页 |
| **共创** | **一个 14 行的空壳路由** | **5 张表 + 状态机 + 20 个接口的完整闭环** |
| 作品 | 只有投稿 + 点赞 | 发布/编辑/上下架/详情/浏览计数/审核/收藏/点赞 |
| 社区 | 无 | 评论（楼中楼）、多态点赞收藏、关注、话题、通知 |
| 管理后台 | 无 | 内容审核 + 用户管理 + 认证审核 + 数据看板 + 趋势 + 操作日志 |
| AI | 一个独立聊天框 | 4 个嵌入业务的 AI 能力 + 推荐，且无 Key 自动降级 |
| 工程规范 | try/catch 满屏、响应格式不一 | 分层架构 + 统一响应 + 全局异常 + 参数校验 + OpenAPI 文档 |

**一句话**：从「一个能登录的静态展示站」变成「一个有协作内核的平台」。

---

## 二、技术栈

| 项 | 选型 | 说明 |
|---|---|---|
| 运行时 | Node.js ≥ 20 | 用了内置 `fetch`，无需 axios |
| 框架 | Express 4 | 生态成熟、评委易读 |
| 数据库 | SQLite（better-sqlite3） | 零运维、单文件，部署到云服务器最省事；SQL 已隔离在 repository 层，将来换 MySQL 只改这一层 |
| 认证 | JWT + bcryptjs | 密码 bcrypt 加盐哈希，token 7 天过期 |
| 校验 | 自研 `utils/validate.js` | 零依赖，返回字段级中文错误 |
| 文档 | OpenAPI 3 + Swagger UI | `/api-docs`，CDN 加载，不占依赖 |
| AI | 阿里云百炼 / 通义千问 | 无 Key 时自动规则兜底 |

---

## 三、目录结构（分层架构）

```
backend/
├── server.js                  # 装配入口：中间件 → 路由 → 错误处理
├── config/index.js            # 环境变量集中管理
├── db/
│   ├── database.js            # 23 张表建表语句（幂等）
│   ├── seed.js                # 内容库灌库
│   ├── import-data.js         # 从前端 data.js 抽取内容 → seed-data.json
│   └── seed-data.json         # 抽取结果（10 分类/49 项目/19 传承人/14 作品...）
├── utils/                     # response(统一响应) / validate(校验) / pagination / id
├── middleware/                # auth(认证+角色) / error(全局异常+asyncHandler)
├── repositories/              # ★ SQL 层：只写 SQL，不做业务判断
│   ├── user.repo.js
│   ├── heritage.repo.js
│   ├── work.repo.js
│   ├── project.repo.js        # 共创 5 张表
│   └── social.repo.js         # 互动/评论/通知/话题
├── services/                  # ★ 业务层：状态机、权限、通知都在这里
│   ├── auth.service.js
│   ├── user.service.js
│   ├── heritage.service.js
│   ├── work.service.js
│   ├── project.service.js     # ★ 共创核心（状态机 + 前置条件校验）
│   ├── social.service.js
│   ├── notification.service.js
│   └── ai.service.js
├── routes/                    # ★ 控制层：只做参数校验 + 调 service + 返回
│   ├── auth.js  users.js  heritage.js  works.js
│   ├── projects.js            # ★ 共创 20 个接口
│   ├── community.js           # 评论/互动/话题/通知
│   ├── admin.js  ai.js  upload.js
├── scripts/
│   ├── demo-data.js           # 生成 3 个演示共创项目
│   └── smoke-test.js          # 端到端冒烟测试（30 项断言）
├── docs/
│   ├── api.html               # Swagger UI 页面
│   └── openapi.json           # 接口文档（40+ 接口）
└── uploads/                   # 上传文件目录
```

**为什么这样分层**：评委看代码时能一眼看出「改 SQL 去哪、改业务去哪、改接口去哪」，这是「技术实现」维度最直接的加分项。

---

## 四、快速开始（最简单：双击一个文件）

**Windows**：双击项目根目录的 **`启动网站.bat`**
（或 `backend/start.bat`）。脚本会自动：装依赖 → 生成 `.env` → 首次运行自动导入内容库与演示项目 → 启动服务 → **自动用浏览器打开 http://localhost:3000/**。

**手动命令（可选）**：

```bash
cd backend
npm install          # 装依赖
cp .env.example .env # 复制配置（Windows: copy .env.example .env），改成你的 JWT_SECRET
npm start            # 启动（首次启动会通过 db/bootstrap.js 自动灌数据：10 分类 / 49 项目 / 19 传承人 / 14 作品 / 3 个演示共创项目）
```

需要重置演示数据时再手动执行 `npm run seed` 和 `npm run demo`（两者都是幂等的）。

启动后：

- 网站首页：http://localhost:3000/ （网页与 API 同源，不会再出现"连不上后端"）
- 接口文档（答辩现场直接打开）：http://localhost:3000/api-docs
- 健康检查：http://localhost:3000/health
- 关闭：窗口里按 `Ctrl+C`，或直接关掉命令行窗口

### 演示账号（密码均为 `123456`）

| 账号 | 角色 | 用途 |
|---|---|---|
| `admin` | 管理员 | 演示后台审核、用户管理、数据看板 |
| `creator` | 已认证传承人 | 演示发起共创项目 |
| `designer` / `writer` | 已认证创作者 | 演示申请加入、领任务、交成果 |
| `user` | 普通用户 | 演示「未认证不能发起项目」的权限拦截 |

---

## 五、共创状态机（答辩第一张图）

```
                    ┌──────────────────────────────────────────┐
                    │                                          │
  draft ──发布招募──> recruiting ──开始协作──> in_progress      │
    │                    │                        │            │
    │                    │                        ├──提交结项──> reviewing ──结项公示──> closed
    │                    │                        │                 │
    │                    │                        │                 └──退回重做──> in_progress
    └────────────────────┴────────────────────────┴──取消──> cancelled
```

**每一步都有前置条件校验**（这是「真闭环」和「假闭环」的区别）：

| 流转 | 前置条件 | 不满足时 |
|---|---|---|
| → `recruiting` | 项目描述 ≥ 10 字 | 400 |
| → `in_progress` | 至少 2 名已通过成员（含发起人） | 409 |
| → `reviewing` | 至少 1 个成果版本 | 409 |
| → `closed` | 有可公示成果；自动把最终版本发布为作品 | 409 |
| 任意非法跳转 | 严格按 TRANSITIONS 表 | 409 |

其他子状态机：
- 成员：`pending → approved` / `rejected` / `quit` / `removed`（被驳回后可以重新申请）
- 任务：`todo → doing → review → done`（进度到 100% 自动进 review，验收只能由发起人做）

---

## 六、接口清单

统一响应格式：

```json
{ "code": 0, "message": "ok", "data": {} }
```

分页统一返回 `data.list / data.total / data.page / data.pageSize / data.totalPages`。

### 6.1 认证 `/api/auth`
| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/register` | 注册 |
| POST | `/login` | 登录（失败时也走一次 hashCode，防用户名枚举） |
| GET | `/me` | 当前用户完整信息（含统计、成就、认证状态） |
| PUT | `/password` | 改密（校验旧密码） |
| POST | `/forgot-password` | 申请重置令牌 |
| POST | `/reset-password` | 用令牌重置 |
| DELETE | `/account` | 注销账号 |

### 6.2 用户与认证 `/api/users`
| 方法 | 路径 | 说明 |
|---|---|---|
| GET/PUT | `/me` | 查看 / 修改资料 |
| GET | `/me/favorites` | 我的收藏 |
| POST/GET | `/me/certification` | 提交 / 查询传承人认证 |
| POST/DELETE | `/:userId/follow` | 关注 / 取关 |
| GET | `/:userId/followers` \| `/following` | 粉丝 / 关注列表 |
| GET | `/:userId` | 用户公开主页 |

### 6.3 内容库 `/api/content`
| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/categories` | 10 个非遗分类（带项目数） |
| GET | `/heritage` | 项目列表：`category/region/level/keyword/sort/page/pageSize` |
| GET | `/heritage/:id` | 详情（含传承人、相关推荐，自动 +1 浏览） |
| GET | `/heritage/regions` | 地区下拉 |
| GET | `/inheritors` \| `/inheritors/:id` | 传承人 |
| GET/POST/DELETE | `/materials` | 公共素材库（纹样/音效/资料） |
| POST | `/materials/:id/download` | 下载计数 |
| GET | `/events`、POST `/events/:id/signup` | 活动与报名 |
| GET | `/news` | 资讯 |
| GET | `/achievements` | 成就（登录后带 unlocked 状态） |

### 6.4 共创协作 `/api/projects` ★核心
| 方法 | 路径 | 权限 | 说明 |
|---|---|---|---|
| GET | `/meta` | 公开 | 状态机定义（前端渲染流程条） |
| GET | `/` | 公开 | 列表（status/heritageId/keyword/sort/mine=owned\|joined） |
| GET | `/:id` | 公开 | 详情（成员/任务/版本/讨论/我的身份/canApply） |
| POST | `/` | 已认证创作者 | 发起项目（`publish:true` 直接进招募） |
| PUT | `/:id` | 发起人/管理员 | 编辑 |
| PATCH | `/:id/status` | 发起人/管理员 | **状态流转（含前置校验）** |
| POST | `/:id/apply` | 登录用户 | 申请加入（填分工与理由） |
| GET | `/:id/members` | 公开 | 成员列表 |
| PATCH | `/:id/members/:uid` | 发起人 | 审核通过/驳回 |
| PATCH | `/:id/members/:uid/role` | 发起人 | 调整分工 |
| DELETE | `/:id/members/:uid` | 发起人 | 移除成员 |
| POST | `/:id/leave` | 成员 | 主动退出 |
| GET/POST | `/:id/tasks` | 成员 | 任务列表 / 创建并指派 |
| PATCH/DELETE | `/tasks/:taskId` | 负责人/发起人 | 改进度、交成果、验收 / 删除 |
| GET/POST | `/:id/versions` | 成员 | 成果版本（历史回溯） |
| POST | `/:id/versions/:vid/final` | 发起人 | 指定最终版 |
| GET/POST | `/:id/discussions` | 成员 | 讨论（支持 `@` 与回复） |
| GET | `/workspace/me` | 登录 | 我的工作台（发起/参与/待审/待办） |
| GET | `/tasks/me` | 登录 | 我的待办（跨项目） |

### 6.5 社区 `/api`
| 方法 | 路径 | 说明 |
|---|---|---|
| GET/POST/DELETE | `/comments` | 评论（楼中楼，支持 work/project/heritage） |
| POST | `/interactions/toggle` | 通用点赞/收藏切换（多态目标） |
| GET | `/topics`、`/topics/:name/works` | 话题聚合 |
| GET | `/notifications` | 通知（6 类：点赞/评论/关注/项目进度/审核/系统） |
| GET | `/notifications/unread-count` | 未读数（红点） |
| PATCH | `/notifications/read-all` | 全部已读 |

### 6.6 管理后台 `/api/admin`（全部需 admin）
| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/stats` | 数据看板（用户/作品/项目/互动/内容/流量 6 组） |
| GET | `/stats/trend` | 近 N 天趋势（折线图） |
| GET | `/works?status=pending` | 审核队列 |
| PATCH | `/works/:id/audit` | 通过/驳回/下架 |
| GET/PATCH | `/comments`、`/comments/:id/hide` | 评论治理 |
| PATCH | `/projects/:id/offline` | 下架违规项目 |
| GET/PATCH | `/users`、`/users/:id/status`、`/users/:id/role` | 用户管理 |
| GET/PATCH | `/certifications`、`/certifications/:id` | 传承人认证审核（通过自动升 creator） |
| GET | `/audit-logs` | 敏感操作留痕 |

### 6.7 AI `/api/ai`
| 方法 | 路径 | 说明 | 嵌入位置 |
|---|---|---|---|
| GET | `/status` | AI 是否可用 | 前端据此显示/隐藏 AI 按钮 |
| **POST** | **`/chat/stream`** | **RAG 检索增强的流式问答（SSE）** | **AI 问答页** |
| POST | `/chat` | 非遗知识问答（注入 RAG 上下文，一次性返回） | 项目详情页 |
| **POST** | **`/agent/stream`** | **共创 Agent：5 个工具 + 步骤实时推送（SSE）** | **AI 共创实验室** |
| **GET** | **`/tools`** | **Agent 工具清单（Function Calling JSON Schema）** | **AI 共创实验室「技术说明」** |
| POST | `/work-desc` | 生成作品文案 | **作品发布页「AI 帮我写」** |
| POST | `/pattern-idea` | 纹样创意建议 | **共创项目页** |
| POST | `/search-enhance` | 语义搜索扩展（同义词 + 库内标签） | 搜索框 |
| GET | `/recommend` | 个性化推荐（行为 + 热度，冷启动可用） | 首页「为你推荐」 |

**AI 能力的四层结构**

```
用户问题
  ↓
guard.service      输入闸门：提示词注入 / 越界话题 / 隐私信息 → 拦截并给出人话解释
  ↓
rag.service        知识切块（506 片段）→ BM25 + 分类意图加权 → top-k 片段与相似度
  ↓
ai.service         有 QWEN_API_KEY：带上下文流式生成；没有：本地知识库规则生成（同样流式）
  ↓
guard.service      输出后处理 + AI 标识 + 引用依据
```

- `agent.service`：5 个工具（检索项目 / 查详情 / 查已有作品 / 拆任务 / 起草方案）由规划器自主编排，
  每步回传 `thought / tool / args / observation / durationMs`，前端可视化。
- **没有 Key 也能完整演示**：`isAiReady()` 为 false 时全部走本地知识库，接口永远 200，不会白屏。
- **可测**：`npm test` 覆盖 BM25 检索、安全闸门、Agent 编排（20 个用例）。

---

## 七、数据库（23 张表）

| 分组 | 表 | 说明 |
|---|---|---|
| 用户 | `users` | 账号 + role(user/creator/admin) + cert_status |
| | `user_certification` | 传承人认证申请（保留多次申请与审核轨迹） |
| 内容 | `category` | 10 个非遗分类 |
| | `heritage` | 49 个非遗项目（features/steps/tags 存 JSON） |
| | `inheritor` | 19 位传承人 |
| | `material` | 公共素材库 |
| 作品 | `work` | 5 种状态：draft/pending/approved/rejected/offline |
| **共创** | `co_project` | 项目主表 + 6 种状态 |
| | `co_member` | 成员 + 5 种状态 + 分工角色 |
| | `co_task` | 任务 + 4 种状态 + 进度 + 阶段成果 |
| | `co_version` | 成果版本（version_no 自增，is_final 标记） |
| | `co_discussion` | 项目内讨论（mentions 存 JSON） |
| 社区 | `comment` | 多态评论（含 parent_id 楼中楼） |
| | `interaction` | **点赞/收藏/关注三合一**（一张表覆盖所有互动） |
| | `topic` / `work_topic` | 话题聚合 |
| | `notification` | 6 类通知 |
| 运营 | `event` / `enrollment` | 活动与报名 |
| | `news` | 资讯 |
| | `achievement` / `user_achievement` | 成就体系 |
| | `audit_log` | 管理台操作留痕 |

**设计取舍说明**（评委可能会问）：
- 为什么 `interaction` 一张表而不是 like/favorite/follow 三张？—— 三者结构完全一致，合并后新增互动类型零成本，`UNIQUE(user_id,target_type,target_id,action)` 天然防重复。
- 为什么主键用 TEXT 业务 ID 而不是自增？—— 日志可读、分布式友好、前端不怕精度丢失（JS 大整数坑）。
- 为什么不用 MySQL？—— 单文件部署对赛事演示最省事；SQL 已隔离在 repository 层，换库只改一层。

---

## 八、冒烟测试（一条命令验证闭环）

```bash
npm start            # 一个终端起服务
npm run smoke        # 另一个终端跑测试
```

会真实走一遍：注册 → 权限拦截(403) → 建项目 → 申请 → 审核 → 状态流转 → 非法流转(409) → 派任务 → 提交 → 不能自验收(403) → 验收 → 交版本 → 讨论@ → 结项 → 成果自动入库 → 通知 → 工作台 → 参数校验。

实测结果：**30 项断言全部通过**。

---

## 九、部署（20% 的「上线运营」分就在这里）

### 9.1 云服务器（推荐）

```bash
# 1. 上传代码
scp -r backend root@your-server:/var/www/ich

# 2. 服务器上安装
cd /var/www/ich && npm install --omit=dev
cp .env.example .env && vim .env       # 改 JWT_SECRET、CORS_ORIGIN
npm run seed && npm run demo

# 3. 用 PM2 常驻
npm i -g pm2
pm2 start server.js --name ich-api
pm2 save && pm2 startup
```

### 9.2 Nginx 反向代理

```nginx
server {
    listen 80;
    server_name api.your-domain.com;

    client_max_body_size 10m;          # base64 上传需要

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

### 9.3 前端要改的两处

1. `js/api.js` 第 2 行：`const API_BASE_URL = 'https://api.your-domain.com/api';`
2. `server.js` 里的 `CORS_ORIGIN` 改成你的前端域名（不要留 `*`）

---

## 十、答辩准备：五个必问问题的答案

| 问题 | 你的回答落点 |
|---|---|
| 这跟普通非遗展示网站有什么区别？ | 打开 `/api-docs` 看共创那 20 个接口；讲状态机的**前置条件校验**（没 2 个成员不能开协作、没成果不能结项）；现场跑 `npm run smoke` 给评委看 30 项断言 |
| AI 到底做了什么？ | 不是聊天框：`/work-desc` 挂在发布页、`/pattern-idea` 挂在共创页、`/search-enhance` 挂在搜索框、`/recommend` 挂在首页。四个入口四张截图 |
| 数据存在哪？ | 打开 `database.sqlite`，`sqlite3 database.sqlite ".tables"` 一眼看到 23 张表；`/api/admin/stats` 返回真实统计 |
| 权限怎么控制的？ | 三角色 + `requireRole` 中间件 + 业务层二次校验（发起人才能审核、负责人不能自验收）。现场用 user 账号发起项目拿 403 |
| 有没有上线？ | 域名 + Nginx + PM2，PPT 放一张 `pm2 status` 和真实访问量截图 |

---

## 十一、下一步（前端还没接的部分）

后端已就绪，前端目前只有 `auth.js` 调了后端，其余还是 `localStorage`。要拿到「用户体验」分，还需要：

1. **新增 3 个页面**（否则后端白做）
   - `co-projects.html`：共创项目列表（按状态筛选）
   - `co-project-detail.html`：详情 + 申请加入 + 任务看板 + 讨论
   - `my-workspace.html`：我的工作台
2. **替换 4 处 localStorage**
   - `co-create.js` 的作品 → `POST /api/works`
   - `profile.js` 的明文改密码 → `PUT /api/auth/password`（**这条是安全硬伤，必须删**）
   - `events.js` 的报名 → `POST /api/content/events/:id/signup`
   - `script.js` 的收藏 → `POST /api/interactions/toggle`
3. **首页接推荐**：`GET /api/ai/recommend`

---

## 十二、常见问题

**Q：`npm install` 卡在 better-sqlite3？**
它要编译原生模块。国内网络建议先 `npm config set registry https://registry.npmmirror.com`。需要 Node ≥ 20。

**Q：启动报 `SQLITE_CANTOPEN`？**
检查 `database.sqlite` 所在目录是否有写权限；或把 `.env` 里 `DATABASE_PATH` 指向一个可写路径。

**Q：AI 接口返回 `source: "fallback"`？**
说明没配 `QWEN_API_KEY` 或 Key 失效。这是**设计行为**，不是 bug：兜底内容仍可展示，只是标注了来源。

**Q：怎么清空重来？**
```bash
npm run reset && npm run seed && npm run demo
```

**Q：端口被占用？**
`.env` 里改 `PORT=3001`。

---

## 十三、许可

MIT。内容数据来源见前端项目 README。
