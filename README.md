# 河南省非物质文化遗产共创平台

> 以「共创」为核心的中原非遗数字化平台：把豫剧、少林功夫、太极拳、钧瓷、汴绣等河南非遗做成可浏览、可协作、可传播的线上空间。
> 前端原生 HTML/CSS/JS，后端 Node.js + Express + SQLite，AI 能力接入阿里云百炼（通义千问），无 Key 时自动降级为规则兜底。

<p>
  <img alt="Node" src="https://img.shields.io/badge/Node.js-%E2%89%A520-339933?logo=node.js&logoColor=white">
  <img alt="Express" src="https://img.shields.io/badge/Express-4.x-000000?logo=express&logoColor=white">
  <img alt="SQLite" src="https://img.shields.io/badge/SQLite-better--sqlite3-003B57?logo=sqlite&logoColor=white">
  <img alt="License" src="https://img.shields.io/badge/License-MIT-blue">
</p>

---

## 一、项目简介

河南是非遗大省，但多数非遗项目停留在「展板式」的静态介绍：能看，不能参与。
本平台把非遗内容从静态页面搬进数据库，并在其上加了**多人共创**这条主线——创作者可以在平台上发起共创项目、招募协作者、分阶段推进、提交并展示成果，让非遗从「被展示」变成「被一起做出来」。

平台包含三块：

| 模块 | 内容 |
|---|---|
| **非遗内容库** | 10 个门类、49 个非遗项目、19 位传承人、10 场活动、10 条资讯、8 项成果 |
| **共创协作（核心）** | 发起项目 → 招募成员 → 阶段推进（状态机）→ 提交作品 → 结项展示 |
| **社区与传播** | 作品发布、楼中楼评论、点赞收藏、关注、话题、站内通知 |

## 二、核心能力

- **非遗内容可检索**：多条件筛选（门类/地区/级别）、模糊搜索、分页，不再是写死在前端 `data.js` 里的数组。
- **共创项目全流程闭环**：5 张表 + 状态机（招募中 → 协作中 → 已结项）+ 前置条件校验，共 20 个接口。
- **完整账号体系**：注册/登录/改密/找回/注销，JWT 鉴权、bcrypt 加盐哈希、三角色（普通用户 / 传承人 / 管理员）、传承人认证审核。
- **社区互动**：评论（含楼中楼）、多态点赞收藏、关注关系、话题、通知中心。
- **管理后台**：内容审核、用户管理、传承人认证审核、数据看板与趋势、操作日志。
- **AI 嵌入业务**：非遗问答、项目创意建议、作品文案润色、项目智能推荐；**未配置 API Key 时自动走规则兜底，不会报错崩页面**。
- **工程规范**：控制层（routes）→ 业务层（services）→ SQL 层（repositories）分层，统一响应体、全局异常处理、字段级中文校验、OpenAPI 文档。

## 三、技术栈

| 层 | 选型 |
|---|---|
| 前端 | 原生 HTML5 / CSS3 / JavaScript（ES6+）、Fetch API |
| 后端 | Node.js ≥ 20、Express 4 |
| 数据库 | SQLite（better-sqlite3，单文件、零运维；SQL 已隔离在 repository 层，换 MySQL 只改这一层） |
| 认证 | JWT（7 天过期）+ bcryptjs |
| 其他 | express-rate-limit（限流）、dotenv、自研零依赖参数校验 |
| AI | 阿里云百炼 / 通义千问（`QWEN_MODEL` 默认 `qwen-turbo`） |
| 文档 | OpenAPI 3 + Swagger UI（`/api-docs`，CDN 加载，不占依赖） |

## 四、目录结构

```
.
├── backend/                    # 后端 API
│   ├── server.js               # 装配入口：中间件 → 路由 → 错误处理
│   ├── config/index.js         # 环境变量集中管理
│   ├── db/                     # 建表（23 张表）+ 灌库脚本 + seed-data.json
│   ├── middleware/             # auth（认证/角色）、error（全局异常）
│   ├── repositories/           # SQL 层
│   ├── services/               # 业务层（状态机、权限、通知）
│   ├── routes/                 # 控制层（参数校验 + 调 service）
│   ├── scripts/                # 演示数据、端到端冒烟测试
│   ├── docs/                   # openapi.json + Swagger UI 页面
│   ├── uploads/                # 用户上传文件目录
│   ├── .env.example            # 配置模板
│   └── start.bat               # Windows 一键启动
├── 算法网站(3)/                # 前端静态站点
│   ├── index.html              # 首页
│   ├── html/                   # 18 个页面（非遗库/传承人/共创/作品/AI 问答/登录注册/后台…）
│   ├── js/                     # api.js 请求封装、各页面逻辑、data.js
│   ├── css/
│   └── img/                    # 非遗图片资源
└── 快速开始.md                 # 上手指引
```

> 后端通过 `express.static` 同源托管前端，所以启动后端即可直接访问整站，无需另起前端服务。

## 五、本地运行

### Windows 一键启动

双击 `backend/start.bat`，脚本会自动检查 Node.js、安装依赖、复制 `.env`、初始化数据库并启动。

### 手动启动

```bash
cd backend
npm install
cp .env.example .env    # Windows: copy .env.example .env
# 编辑 .env：把 JWT_SECRET 换成 32 位以上随机串（可选）填 QWEN_API_KEY
npm run seed            # 灌内容库
npm run demo            # 生成演示共创项目
npm start               # 启动
```

启动后：

| 地址 | 说明 |
|---|---|
| http://localhost:3000 | 平台首页 |
| http://localhost:3000/api-docs | 接口文档（Swagger UI） |
| http://localhost:3000/health | 健康检查 |
| http://localhost:3000/html/diagnose.html | 环境自检页 |

### 常用脚本

```bash
npm run dev        # nodemon 热重载
npm run smoke      # 端到端冒烟测试（30 项断言）
npm run reset      # 清空 SQLite 数据库
```

## 六、接口概览

共 56 个接口路径，完整定义见 [`backend/docs/openapi.json`](backend/docs/openapi.json)，或启动后在 `/api-docs` 交互式查看。

| 前缀 | 模块 |
|---|---|
| `/api/auth` | 注册、登录、改密、找回、注销 |
| `/api/users` | 用户资料、关注、传承人认证 |
| `/api/content` | 非遗门类 / 项目 / 传承人 / 素材 / 活动 / 资讯 |
| `/api/projects` | 共创项目（核心，20 个接口） |
| `/api/works` | 作品发布、编辑、上下架、审核 |
| `/api/comments` `/api/interactions` `/api/topics` `/api/notifications` | 社区互动 |
| `/api/admin` | 管理后台 |
| `/api/ai` | AI 问答、创意建议、文案润色、推荐 |
| `/api/upload` | 文件上传 |

统一响应格式：

```json
{ "code": 0, "message": "ok", "data": {} }
```

## 七、配置说明

配置项见 [`backend/.env.example`](backend/.env.example)，关键项：

| 变量 | 说明 |
|---|---|
| `JWT_SECRET` | **上线前必须修改**，可用 `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` 生成 |
| `CORS_ORIGIN` | 生产环境建议写死前端域名，不要用 `*` |
| `QWEN_API_KEY` | 阿里云百炼 API Key；留空则 AI 走规则兜底 |
| `DATABASE_PATH` | 留空则使用 `backend/database.sqlite` |

> 仓库中不含任何真实密钥：`.env` 已被 `.gitignore` 排除，仅提交 `.env.example` 模板。

## 八、部署建议

- **单机/云服务器**：`npm ci --omit=dev` → 配置 `.env` → 用 pm2 或 systemd 守护 `node server.js`，Nginx 反代到 3000 端口（后端已设 `trust proxy`，限流可拿到真实 IP）。
- **PaaS（如 Railway / Render）**：构建命令 `cd backend && npm ci`，启动命令 `node server.js`，注意持久化卷要挂到数据库文件与 `uploads/` 所在目录。
- 前端与后端同源部署时无需改动；若前端单独托管（Vercel/Netlify），把 `CORS_ORIGIN` 改为前端域名，并修改 `算法网站(3)/js/api.js` 中的接口基地址。

## 九、说明

本项目为参赛/学习用途的原创作品，页面图片素材来自公开网络，仅用于非商业展示；如需商用请自行替换为已获授权的素材。

## License

[MIT](LICENSE)
